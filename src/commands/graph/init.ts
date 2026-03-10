import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { pgClient } from "@chris-test/db";
import { getStringFlag, hasFlag, parseArgs, shouldUseJsonOutput } from "../../util/args.js";
import { printJson } from "../../util/io.js";
import { COMMAND_SCHEMAS } from "../../util/schemas.js";
import { resolveGraphTarget } from "../../util/graph-target.js";

function initHelp(): string {
  return [
    "Usage:",
    "  fide graph init [--target <key-or-path>] [--dir <path>] [--json]",
    "  fide graph init --target <postgres-key> --dangerously-drop --yes [--json]",
  ].join("\n");
}

function quoteIdent(value: string): string {
  return `"${value.replaceAll("\"", "\"\"")}"`;
}

/**
 * @description Initializes a minimal local .fide folder structure.
 */
export async function runInitCommand(args: string[]): Promise<number> {
  const parsed = parseArgs(args);
  const flags = parsed.flags;
  if (hasFlag(flags, "help") || hasFlag(flags, "-h")) {
    if (shouldUseJsonOutput(flags)) {
      printJson(COMMAND_SCHEMAS["graph.init"]);
    } else {
      console.log(initHelp());
    }
    return 0;
  }

  const target = resolveGraphTarget(flags);
  const dangerouslyDrop = hasFlag(flags, "dangerously-drop");
  const confirmed = hasFlag(flags, "yes");
  if (target.type === "postgres") {
    if (getStringFlag(flags, "dir")) {
      throw new Error("`--dir` is only valid for local graph init.");
    }
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
    const statementsTableSql = quoteIdent(target.statementsTable);
    const statementsQualified = `${schemaSql}.${statementsTableSql}`;
    const referenceIdentifiersQualified = `${schemaSql}."reference_identifiers"`;
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

    await pgClient`
      CREATE TABLE IF NOT EXISTS reference_identifiers (
        identifier_fingerprint CHAR(36) PRIMARY KEY,
        reference_identifier TEXT NOT NULL
      );
    `;

    await pgClient`
      CREATE TABLE IF NOT EXISTS statements (
        statement_fingerprint CHAR(36) PRIMARY KEY,
        subject_type entity_type NOT NULL,
        subject_reference_type entity_type NOT NULL,
        subject_fingerprint CHAR(36) NOT NULL,
        predicate_fingerprint CHAR(36) NOT NULL,
        object_type entity_type NOT NULL,
        object_reference_type entity_type NOT NULL,
        object_fingerprint CHAR(36) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `;

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
            AND t.relname = '${target.statementsTable.replaceAll("'", "''")}'
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
            AND t.relname = '${target.statementsTable.replaceAll("'", "''")}'
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
      statementsTable: target.statementsTable,
      initialized: true,
      dropped: dangerouslyDrop,
    };
    if (shouldUseJsonOutput(flags)) {
      printJson(payload);
    } else {
      console.log(`Initialized postgres graph target ${target.key ?? "<unnamed>"} at ${target.schema}.${target.statementsTable}`);
    }
    return 0;
  }

  const targetDir = getStringFlag(flags, "dir");
  if (dangerouslyDrop) {
    throw new Error("`--dangerously-drop` is only supported for postgres targets.");
  }
  if (confirmed) {
    throw new Error("`--yes` is only valid with `--dangerously-drop`.");
  }
  if (targetDir) {
    if (parsed.positionals.length > 0) {
      throw new Error("Unexpected positional arguments.");
    }
  }

  const root = targetDir ? resolve(process.cwd(), targetDir) : target.root;
  const directories = [resolve(root, ".fide"), resolve(root, ".fide/statements")];

  for (const directory of directories) {
    await mkdir(directory, { recursive: true });
  }

  if (shouldUseJsonOutput(flags)) {
    printJson({
      ok: true,
      root,
      created: directories,
    });
  } else {
    console.log(`Initialized .fide workspace at ${root}`);
    for (const directory of directories) {
      console.log(`- ${directory}`);
    }
  }

  return 0;
}
