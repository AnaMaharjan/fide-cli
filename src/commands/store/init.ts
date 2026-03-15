import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { pgClient } from "@chris-test/db";
import { getStringFlag, hasFlag, parseArgs, shouldUseJsonOutput } from "../../util/args.js";
import { renderHelp } from "../../util/help.js";
import { printJson } from "../../util/io.js";
import { GRAPH_REFERENCE_IDENTIFIERS_TABLE, GRAPH_STATEMENTS_TABLE, resolveStoreTarget, validateGraphSettings, type FideSettings, type GraphRecipe } from "../../util/graph/target.js";
import { ensureSqliteGraphSchema } from "../../util/graph/sqlite.js";
import { getSqliteWarnings } from "../../util/graph/local-disk-warning.js";
import { readJsonFile, resolveSettingsPath } from "../../util/workspace.js";

function initHelp(): string {
  return renderHelp({
    sections: [
      {
        title: "Usage",
        items: [
          "  fide store init --store <name>",
          "  fide store init --type postgres --connection <value> [--store <name>] [--schema <name>] [--recipe <json>]",
          "  fide store init --type sqlite --connection <value> [--store <name>] [--recipe <json>]",
          "  fide store init --store <name> --dangerously-drop --yes",
        ],
      },
      {
        title: "Flags",
        items: [
          "  --store <name>           Existing configured backend target name, or new target name with --type",
          "  --type <postgres|sqlite> Create a configured backend target before initializing it",
          "  --connection <value>     Connection value or env var name for postgres/sqlite targets",
          "  --schema <name>          Postgres schema name (default: fide_graph)",
          "  --recipe <json>          JSON array of { from, sql } recipe steps for a materialized target",
          "  --gitignore              Add sqlite files to .gitignore",
          "  --dangerously-drop       Reset the resolved store target before re-initializing",
          "  --yes                    Confirm --dangerously-drop",
          "  --pretty, -p             Human-readable output",
        ],
      },
      {
        title: "Notes",
        items: [
          "  - `fide store init` only supports configured sqlite/postgres targets.",
          "  - Use `fide graph init` for local workspace setup.",
        ],
      },
    ],
  });
}

function quoteIdent(value: string): string {
  return `"${value.replaceAll("\"", "\"\"")}"`;
}

function isWithinRoot(root: string, targetPath: string): boolean {
  const rel = relative(root, targetPath);
  return rel !== ".." && !rel.startsWith("../") && rel !== "" && !rel.startsWith("..\\");
}

function toGitignoreEntry(root: string, targetPath: string): string | null {
  if (!isWithinRoot(root, targetPath)) return null;
  const rel = relative(root, targetPath).replaceAll("\\", "/");
  if (!rel || rel === ".") return null;
  return rel;
}

async function updateGitignore(entries: string[]): Promise<{ path: string; added: string[] }> {
  const gitignorePath = resolve(process.cwd(), ".gitignore");
  const current = existsSync(gitignorePath) ? await readFile(gitignorePath, "utf8") : "";
  const present = new Set(current.split(/\r?\n/).map((line) => line.trim()).filter(Boolean));
  const added = entries.filter((entry) => !present.has(entry));
  if (added.length === 0) {
    return { path: gitignorePath, added: [] };
  }

  const next = current.length === 0
    ? `${added.join("\n")}\n`
    : current.endsWith("\n")
      ? `${current}${added.join("\n")}\n`
      : `${current}\n${added.join("\n")}\n`;
  await writeFile(gitignorePath, next, "utf8");
  return { path: gitignorePath, added };
}

async function createConfiguredTarget(flags: Map<string, string | boolean>): Promise<string> {
  const type = getStringFlag(flags, "type");
  if (!type) {
    throw new Error("Missing required flag: --type <postgres|sqlite>.");
  }
  if (type !== "postgres" && type !== "sqlite") {
    throw new Error("Invalid --type value. Expected one of: postgres, sqlite.");
  }
  const requestedTarget = getStringFlag(flags, "store");
  if (!requestedTarget) {
    throw new Error("When `--type` is set, pass --store <name> for the configured store target.");
  }
  if (requestedTarget.startsWith("/") || requestedTarget.startsWith("./") || requestedTarget.startsWith("../") || requestedTarget.startsWith("~/") || requestedTarget.includes("/")) {
    throw new Error("When `--type` is set, `--store` must be a store name, not a path.");
  }

  const connection = getStringFlag(flags, "connection");
  if (!connection) {
    throw new Error("Missing required flag: --connection <value>.");
  }
  const recipeFlag = getStringFlag(flags, "recipe");
  let recipe: GraphRecipe | undefined;
  if (recipeFlag) {
    try {
      recipe = JSON.parse(recipeFlag) as GraphRecipe;
    } catch {
      throw new Error("Invalid --recipe value. Expected JSON like '[{\"from\":\"primary\",\"sql\":\"SELECT * FROM statements\"}]'.");
    }
  }

  const settingsPath = resolveSettingsPath(process.cwd());
  const current = readJsonFile<FideSettings>(settingsPath) ?? {};
  const storeTargets = current.storeTargets ?? {};
  if (storeTargets[requestedTarget]) {
    throw new Error(`Store target "${requestedTarget}" already exists in settings.json.`);
  }

  storeTargets[requestedTarget] = type === "postgres"
    ? {
      type,
      connection,
      schema: getStringFlag(flags, "schema") ?? "fide_graph",
      ...(recipe ? { recipe } : {}),
    }
    : {
      type,
      connection,
      ...(recipe ? { recipe } : {}),
    };

  current.storeTargets = storeTargets;
  validateGraphSettings(current);
  await mkdir(resolve(settingsPath, ".."), { recursive: true });
  await writeFile(settingsPath, `${JSON.stringify(current, null, 2)}\n`, "utf8");
  return requestedTarget;
}

export async function runStoreInit(args: string[]): Promise<number> {
  const parsed = parseArgs(args);
  const flags = parsed.flags;
  if (hasFlag(flags, "help") || hasFlag(flags, "-h")) {
    console.log(initHelp());
    return 0;
  }
  if (parsed.positionals.length > 0) {
    throw new Error("Unexpected positional arguments. Use --store <name>.");
  }

  if (flags.has("type")) {
    const key = await createConfiguredTarget(flags);
    flags.set("store", key);
  }
  if (!flags.has("store")) {
    throw new Error("Missing required flag: --store <name>. Use `fide graph init` for local workspaces.");
  }

  const target = resolveStoreTarget(flags);

  const dangerouslyDrop = hasFlag(flags, "dangerously-drop");
  const confirmed = hasFlag(flags, "yes");
  const shouldUpdateGitignore = hasFlag(flags, "gitignore");
  if (dangerouslyDrop && !confirmed) {
    throw new Error("`--dangerously-drop` requires `--yes`.");
  }

  if (target.type === "postgres") {
    if (!target.databaseUrl) {
      throw new Error(
        `Missing postgres connection for store target "${target.key ?? "unknown"}". Configure the target in settings.json or set the referenced env var.`,
      );
    }

    process.env.DATABASE_URL = target.databaseUrl;
    const schemaSql = quoteIdent(target.schema);
    const statementsTableSql = quoteIdent(GRAPH_STATEMENTS_TABLE);
    const statementsQualified = `${schemaSql}.${statementsTableSql}`;
    const referenceIdentifiersQualified = `${schemaSql}.${quoteIdent(GRAPH_REFERENCE_IDENTIFIERS_TABLE)}`;
    const entityTypeQualified = `${schemaSql}."entity_type"`;

    if (dangerouslyDrop) {
      await pgClient.unsafe(`DROP TABLE IF EXISTS ${statementsQualified} CASCADE;`);
      await pgClient.unsafe(`DROP TABLE IF EXISTS ${referenceIdentifiersQualified} CASCADE;`);
      await pgClient.unsafe(`DROP TYPE IF EXISTS ${entityTypeQualified} CASCADE;`);
    }

    await pgClient.unsafe(`CREATE SCHEMA IF NOT EXISTS ${schemaSql};`);
    await pgClient.unsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_type t
          INNER JOIN pg_namespace n ON t.typnamespace = n.oid
          WHERE t.typname = 'entity_type'
            AND n.nspname = '${target.schema.replaceAll("'", "''")}'
        ) THEN
          CREATE TYPE ${entityTypeQualified} AS ENUM (
            '00','10','11','12','20','21','22','30','31','40','41','42','43','a0','a1','a2','a3','a4','a5','a6','a7','a8','a9'
          );
        END IF;
      END
      $$;
    `);

    await pgClient.unsafe(`
      CREATE TABLE IF NOT EXISTS ${referenceIdentifiersQualified} (
        identifier_fingerprint CHAR(36) PRIMARY KEY,
        reference_identifier TEXT NOT NULL
      );
    `);
    await pgClient.unsafe(`
      CREATE TABLE IF NOT EXISTS ${statementsQualified} (
        statement_fingerprint CHAR(36) PRIMARY KEY,
        subject_type ${entityTypeQualified} NOT NULL,
        subject_reference_type ${entityTypeQualified} NOT NULL,
        subject_fingerprint CHAR(36) NOT NULL,
        predicate_fingerprint CHAR(36) NOT NULL,
        object_type ${entityTypeQualified} NOT NULL,
        object_reference_type ${entityTypeQualified} NOT NULL,
        object_fingerprint CHAR(36) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await pgClient.unsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint c
          INNER JOIN pg_class t ON c.conrelid = t.oid
          INNER JOIN pg_namespace n ON t.relnamespace = n.oid
          WHERE c.conname = 'chk_subject_protocol_self_sourced'
            AND n.nspname = '${target.schema.replaceAll("'", "''")}'
            AND t.relname = '${GRAPH_STATEMENTS_TABLE.replaceAll("'", "''")}'
        ) THEN
          ALTER TABLE ${statementsQualified}
          ADD CONSTRAINT chk_subject_protocol_self_sourced CHECK (
            (subject_type = '00' AND subject_reference_type = '00') OR
            (subject_type <> '00' AND subject_reference_type <> '00')
          );
        END IF;
      END
      $$;
    `);
    await pgClient.unsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint c
          INNER JOIN pg_class t ON c.conrelid = t.oid
          INNER JOIN pg_namespace n ON t.relnamespace = n.oid
          WHERE c.conname = 'chk_object_protocol_self_sourced'
            AND n.nspname = '${target.schema.replaceAll("'", "''")}'
            AND t.relname = '${GRAPH_STATEMENTS_TABLE.replaceAll("'", "''")}'
        ) THEN
          ALTER TABLE ${statementsQualified}
          ADD CONSTRAINT chk_object_protocol_self_sourced CHECK (
            (object_type = '00' AND object_reference_type = '00') OR
            (object_type <> '00' AND object_reference_type <> '00')
          );
        END IF;
      END
      $$;
    `);

    const payload = {
      ok: true,
      target: "postgres",
      key: target.key,
      schema: target.schema,
      recipe: target.recipe,
      dropped: dangerouslyDrop,
    };
    if (shouldUseJsonOutput(flags)) {
      printJson(payload);
    } else {
      console.log(`Initialized postgres store target ${target.key ?? "<unnamed>"} at ${target.schema}.${GRAPH_STATEMENTS_TABLE}`);
    }
    return 0;
  }

  if (dangerouslyDrop) {
    await rm(target.file, { force: true });
  }
  await mkdir(resolve(target.file, ".."), { recursive: true });
  await ensureSqliteGraphSchema(target.file, { drop: false });
  const gitignoreEntries = shouldUpdateGitignore
    ? [
      toGitignoreEntry(process.cwd(), target.file),
      toGitignoreEntry(process.cwd(), `${target.file}-shm`),
      toGitignoreEntry(process.cwd(), `${target.file}-wal`),
      toGitignoreEntry(process.cwd(), `${target.file}-journal`),
    ].filter((value): value is string => Boolean(value))
    : [];
  const gitignore = gitignoreEntries.length > 0 ? await updateGitignore(gitignoreEntries) : null;

  if (shouldUseJsonOutput(flags)) {
    printJson({
      ok: true,
      target: "sqlite",
      key: target.key,
      file: target.file,
      recipe: target.recipe,
      dropped: dangerouslyDrop,
      gitignorePath: gitignore?.path,
      gitignoreAdded: gitignore?.added ?? [],
      warnings: getSqliteWarnings(target.file, { gitignore: target.gitignore }),
    });
  } else {
    console.log(`Initialized sqlite store target ${target.key ?? "<unnamed>"} at ${target.file}`);
    if (gitignore && gitignore.added.length > 0) {
      console.log(`Updated ${gitignore.path}`);
    }
  }
  return 0;
}
