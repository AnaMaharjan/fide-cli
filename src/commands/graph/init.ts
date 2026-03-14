import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { pgClient } from "@chris-test/db";
import { getStringFlag, hasFlag, parseArgs, shouldUseJsonOutput } from "../../util/args.js";
import { renderHelp } from "../../util/help.js";
import { printJson } from "../../util/io.js";
import { GRAPH_REFERENCE_IDENTIFIERS_TABLE, GRAPH_STATEMENTS_TABLE, resolveGraphTarget, validateGraphSettings, type FideSettings, type GraphRecipe } from "../../util/graph/target.js";
import { ensureSqliteGraphSchema } from "../../util/graph/sqlite.js";
import { getLocalWorkspaceWarnings, getSqliteWarnings } from "../../util/graph/local-disk-warning.js";

function initHelp(): string {
  return renderHelp({
    sections: [
      {
        title: "Usage",
        items: [
          "  fide graph init",
          "  fide graph init --target <key-or-path>",
          "  fide graph init --type postgres --connection <value> [--target <name>] [--schema <name>] [--recipe <json>]",
          "  fide graph init --type sqlite --connection <value> [--target <name>] [--recipe <json>]",
          "  fide graph init --target <key-or-path> --dangerously-drop --yes",
        ],
      },
      {
        title: "Flags",
        items: [
          "  --target <key-or-path>   Existing target key, local workspace path, or new target name with --type",
          "  --type <postgres|sqlite> Create a configured graph target before initializing it",
          "  --connection <value>     Connection value or env var name for postgres/sqlite targets",
          "  --schema <name>          Postgres schema name (default: fide_graph)",
          "  --recipe <json>          JSON array of { from, sql } recipe steps for a derived graph target",
          "  --gitignore              Add generated local/sqlite outputs to .gitignore",
          "  --dangerously-drop       Reset the resolved graph target before re-initializing",
          "  --yes                    Confirm --dangerously-drop",
          "  --pretty, -p             Human-readable output",
        ],
      },
      {
        title: "Examples",
        items: [
          "  fide graph init",
          "  fide graph init --target primary",
          "  fide graph init --type sqlite --connection .tmp/fide-graph.sqlite",
          "  fide graph init --type postgres --target combined --connection FIDE_GRAPH_DATABASE_URL --recipe '[{\"from\":\"primary\",\"sql\":\"SELECT * FROM statements\"}]'",
          "  fide graph init --type sqlite --connection .tmp/fide-graph.sqlite --gitignore",
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

function toGitignoreEntry(root: string, targetPath: string, isDirectory: boolean): string | null {
  if (!isWithinRoot(root, targetPath)) return null;
  const rel = relative(root, targetPath).replaceAll("\\", "/");
  if (!rel || rel === ".") return null;
  return isDirectory ? `${rel}/` : rel;
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
  const requestedTarget = getStringFlag(flags, "target");
  if (requestedTarget && (requestedTarget.startsWith("/") || requestedTarget.startsWith("./") || requestedTarget.startsWith("../") || requestedTarget.startsWith("~/") || requestedTarget.includes("/"))) {
    throw new Error("When `--type` is set, `--target` must be a target name, not a path.");
  }

  const key = requestedTarget ?? type;
  const connection = getStringFlag(flags, "connection");
  const recipeFlag = getStringFlag(flags, "recipe");
  if (!connection) {
    throw new Error("Missing required flag: --connection <value>.");
  }
  let recipe: GraphRecipe | undefined;
  if (recipeFlag) {
    try {
      recipe = JSON.parse(recipeFlag) as GraphRecipe;
    } catch {
      throw new Error("Invalid --recipe value. Expected JSON like '[{\"from\":\"primary\",\"sql\":\"SELECT * FROM statements\"}]'.");
    }
  }

  const settingsPath = resolve(process.cwd(), ".fide", "settings.json");
  const current = existsSync(settingsPath)
    ? JSON.parse(await readFile(settingsPath, "utf8")) as FideSettings
    : {};
  const graphTargets = current.graphTargets ?? {};
  if (graphTargets[key]) {
    throw new Error(
      requestedTarget
        ? `Graph target "${key}" already exists in .fide/settings.json.`
        : `Default target name "${key}" already exists. Pass --target <target-name>.`,
    );
  }

  graphTargets[key] = type === "postgres"
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

  current.graphTargets = graphTargets;
  validateGraphSettings(current);
  await mkdir(resolve(settingsPath, ".."), { recursive: true });
  await writeFile(settingsPath, `${JSON.stringify(current, null, 2)}\n`, "utf8");
  return key;
}

/**
 * @description Initializes the minimal local .fide workspace root.
 */
export async function runInitCommand(args: string[]): Promise<number> {
  const parsed = parseArgs(args);
  const flags = parsed.flags;
  if (hasFlag(flags, "help") || hasFlag(flags, "-h")) {
    console.log(initHelp());
    return 0;
  }

  if (flags.has("type")) {
    const key = await createConfiguredTarget(flags);
    flags.set("target", key);
  }

  const target = resolveGraphTarget(flags);
  const dangerouslyDrop = hasFlag(flags, "dangerously-drop");
  const confirmed = hasFlag(flags, "yes");
  const shouldUpdateGitignore = hasFlag(flags, "gitignore");
  if (target.type === "postgres") {
    if (dangerouslyDrop && !confirmed) {
      throw new Error("`--dangerously-drop` requires `--yes`.");
    }
    if (!target.databaseUrl) {
      throw new Error(
        `Missing postgres connection for graph target "${target.key ?? "unknown"}". Set FIDE_GRAPH_DATABASE_URL or configure the target in .fide/settings.json.`,
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
      console.log(`Initialized postgres graph target ${target.key ?? "<unnamed>"} at ${target.schema}.${GRAPH_STATEMENTS_TABLE}`);
    }
    return 0;
  }

  if (target.type === "sqlite") {
    if (dangerouslyDrop && !confirmed) {
      throw new Error("`--dangerously-drop` requires `--yes`.");
    }

    if (dangerouslyDrop) {
      await rm(target.file, { force: true });
    }
    await mkdir(resolve(target.file, ".."), { recursive: true });
    await ensureSqliteGraphSchema(target.file, { drop: false });
    const gitignoreEntries = shouldUpdateGitignore
      ? [
        toGitignoreEntry(process.cwd(), target.file, false),
        toGitignoreEntry(process.cwd(), `${target.file}-shm`, false),
        toGitignoreEntry(process.cwd(), `${target.file}-wal`, false),
        toGitignoreEntry(process.cwd(), `${target.file}-journal`, false),
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
      console.log(`Initialized sqlite graph target ${target.key ?? "<unnamed>"} at ${target.file}`);
      if (gitignore && gitignore.added.length > 0) {
        console.log(`Updated ${gitignore.path}`);
      }
    }
    return 0;
  }

  if (dangerouslyDrop) {
    if (!confirmed) {
      throw new Error("`--dangerously-drop` requires `--yes`.");
    }
  } else if (confirmed) {
    throw new Error("`--yes` is only valid with `--dangerously-drop`.");
  }
  if (parsed.positionals.length > 0) {
    throw new Error("Unexpected positional arguments.");
  }

  const root = target.root;
  const fideDir = resolve(root, ".fide");
  if (dangerouslyDrop) {
    await rm(fideDir, { recursive: true, force: true });
  }
  const directories = [resolve(root, ".fide")];

  for (const directory of directories) {
    await mkdir(directory, { recursive: true });
  }
  const gitignoreEntries = shouldUpdateGitignore
    ? [
      toGitignoreEntry(process.cwd(), resolve(root, ".fide", "statements"), true),
      toGitignoreEntry(process.cwd(), resolve(root, ".fide", "drafts"), true),
    ].filter((value): value is string => Boolean(value))
    : [];
  const gitignore = gitignoreEntries.length > 0 ? await updateGitignore(gitignoreEntries) : null;

  if (shouldUseJsonOutput(flags)) {
    printJson({
      ok: true,
      root,
      created: directories,
      dropped: dangerouslyDrop,
      gitignorePath: gitignore?.path,
      gitignoreAdded: gitignore?.added ?? [],
      warnings: getLocalWorkspaceWarnings(root, { gitignore: target.gitignore }),
    });
  } else {
    console.log(`Initialized .fide workspace at ${root}`);
    for (const directory of directories) {
      console.log(`- ${directory}`);
    }
    if (gitignore && gitignore.added.length > 0) {
      console.log(`Updated ${gitignore.path}`);
    }
  }

  return 0;
}
