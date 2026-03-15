import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pgClient } from "@chris-test/db";
import { getStringFlag, hasFlag, parseArgs, shouldUseJsonOutput } from "../../util/args.js";
import { renderHelp } from "../../util/help.js";
import { printJson } from "../../util/io.js";
import { type FideSettings, validateGraphSettings } from "../../util/graph/target.js";
import { resolveAppTarget, validateAppSettings, type FideAppSettings } from "../../util/app/target.js";
import { readJsonFile, resolveSettingsPath } from "../../util/workspace.js";

function initHelp(): string {
  return renderHelp({
    sections: [
      {
        title: "Usage",
        items: [
          "  fide app init --connection <value>",
          "  fide app init --connection <value> [--target <name>] [--schema <name>]",
          "  fide app init --target <name>",
          "  fide app init --target <name> --dangerously-drop --yes",
        ],
      },
      {
        title: "Flags",
        items: [
          "  --target <name>         Existing app target key or new target name",
          "  --connection <value>    Connection value or env var name for the postgres app target",
          "  --schema <name>         App schema name (default: fide_app)",
          "  --dangerously-drop      Reset the resolved app schema before re-initializing",
          "  --yes                   Confirm --dangerously-drop",
          "  --pretty, -p            Human-readable output",
        ],
      },
      {
        title: "Examples",
        items: [
          "  fide app init --connection FIDE_GRAPH_DATABASE_URL_SB",
          "  fide app init --target primary --connection FIDE_GRAPH_DATABASE_URL_SB",
          "  fide app init --target primary --schema fide_app",
        ],
      },
    ],
  });
}

function quoteIdent(value: string): string {
  return `"${value.replaceAll("\"", "\"\"")}"`;
}

async function createConfiguredAppTarget(flags: Map<string, string | boolean>): Promise<string> {
  const connection = getStringFlag(flags, "connection");
  if (!connection) {
    throw new Error("Missing required flag: --connection <value>.");
  }

  const requestedTarget = getStringFlag(flags, "target");
  if (requestedTarget && (requestedTarget.startsWith("/") || requestedTarget.includes("/"))) {
    throw new Error("`fide app init --target` expects a target name, not a path.");
  }

  const key = requestedTarget ?? "postgres";
  const settingsPath = resolveSettingsPath(process.cwd());
  const current = readJsonFile<FideSettings & FideAppSettings>(settingsPath) ?? {};

  const appTargets = current.appTargets ?? {};
  if (appTargets[key]) {
    throw new Error(
      requestedTarget
        ? `App target "${key}" already exists in settings.json.`
        : `Default app target name "${key}" already exists. Pass --target <target-name>.`,
    );
  }

  appTargets[key] = {
    type: "postgres",
    connection,
    schema: getStringFlag(flags, "schema") ?? "fide_app",
  };

  current.appTargets = appTargets;
  validateGraphSettings(current);
  validateAppSettings(current);
  await mkdir(resolve(settingsPath, ".."), { recursive: true });
  await writeFile(settingsPath, `${JSON.stringify(current, null, 2)}\n`, "utf8");
  return key;
}

export async function runAppInit(args: string[]): Promise<number> {
  const parsed = parseArgs(args);
  const flags = parsed.flags;
  if (hasFlag(flags, "help") || hasFlag(flags, "-h")) {
    console.log(initHelp());
    return 0;
  }

  if (flags.has("connection")) {
    const key = await createConfiguredAppTarget(flags);
    flags.set("target", key);
  }

  const target = resolveAppTarget(flags);
  const dangerouslyDrop = hasFlag(flags, "dangerously-drop");
  const confirmed = hasFlag(flags, "yes");
  if (dangerouslyDrop && !confirmed) {
    throw new Error("`--dangerously-drop` requires `--yes`.");
  }
  if (!target.databaseUrl) {
    throw new Error(
      `Missing postgres connection for app target "${target.key ?? "unknown"}". Configure the target in settings.json or set the referenced env var.`,
    );
  }

  process.env.DATABASE_URL = target.databaseUrl;
  const schemaSql = quoteIdent(target.schema);
  const queriesTableQualified = `${schemaSql}."graph_queries"`;
  const runsTableQualified = `${schemaSql}."graph_query_runs"`;

  if (dangerouslyDrop) {
    await pgClient.unsafe(`DROP TABLE IF EXISTS ${runsTableQualified} CASCADE;`);
    await pgClient.unsafe(`DROP TABLE IF EXISTS ${queriesTableQualified} CASCADE;`);
    await pgClient.unsafe(`DROP SCHEMA IF EXISTS ${schemaSql} CASCADE;`);
  }

  await pgClient.unsafe(`CREATE SCHEMA IF NOT EXISTS ${schemaSql};`);

  await pgClient.unsafe(`
    CREATE TABLE IF NOT EXISTS ${queriesTableQualified} (
      name TEXT PRIMARY KEY,
      graph_id TEXT NOT NULL,
      sql TEXT NOT NULL,
      description TEXT,
      fields JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pgClient.unsafe(`
    ALTER TABLE ${queriesTableQualified}
    ADD COLUMN IF NOT EXISTS fields JSONB NOT NULL DEFAULT '{}'::jsonb;
  `);

  await pgClient.unsafe(`
    CREATE TABLE IF NOT EXISTS ${runsTableQualified} (
      query_name TEXT REFERENCES ${queriesTableQualified}(name) ON DELETE CASCADE,
      graph_id TEXT NOT NULL,
      sql TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL,
      row_count INTEGER,
      result_json JSONB,
      error TEXT,
      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      finished_at TIMESTAMPTZ
    );
  `);

  await pgClient.unsafe(`
    ALTER TABLE ${runsTableQualified}
    ADD COLUMN IF NOT EXISTS sql TEXT NOT NULL DEFAULT '';
  `);

  const useJson = shouldUseJsonOutput(flags);
  const output = {
    ok: true,
    target: "app",
    key: target.key,
    schema: target.schema,
    created: [
      `${target.schema}.graph_queries`,
      `${target.schema}.graph_query_runs`,
    ],
    dropped: dangerouslyDrop,
  };

  if (!useJson) {
    console.log(`Initialized app target ${target.key ?? "postgres"} in schema ${target.schema}`);
    console.log(`Created: ${target.schema}.graph_queries, ${target.schema}.graph_query_runs`);
    return 0;
  }

  printJson(output);
  return 0;
}
