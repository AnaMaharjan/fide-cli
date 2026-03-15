import { createPgClient } from "@chris-test/db";
import { hasFlag, parseArgs } from "../../util/args.js";
import { renderHelp } from "../../util/help.js";
import { printJson } from "../../util/io.js";
import { GRAPH_REFERENCE_IDENTIFIERS_TABLE, GRAPH_STATEMENTS_TABLE, listConfiguredStoreTargetKeys, resolveStoreTarget, type ResolvedGraphTarget } from "../../util/graph/target.js";
import { inspectSqliteGraph } from "../../util/graph/sqlite.js";
import { getSqliteWarnings } from "../../util/graph/local-disk-warning.js";

function nextCommands(key: string | null, recipe: unknown): Record<string, string> | undefined {
  if (!key) return undefined;
  const next: Record<string, string> = {
    sqlHelpCommand: "fide store sql -h",
    sqlCommand: `fide store sql --store ${key} ...`,
  };
  if (Array.isArray(recipe) && recipe.length > 0) {
    next.materializeHelpCommand = "fide store materialize -h";
    next.materializeCommand = `fide store materialize --store ${key}`;
  }
  return next;
}

export async function runStoreStatus(args: string[] = []): Promise<number> {
  const { flags, positionals } = parseArgs(args);
  if (hasFlag(flags, "help") || hasFlag(flags, "-h")) {
    console.log(renderHelp({
      sections: [
        {
          title: "Usage",
          items: [
            "  fide store status",
            "  fide store status --store <name>",
          ],
        },
        {
          title: "Flags",
          items: [
            "  --store <name>   Configured sqlite or postgres store name",
          ],
        },
        {
          title: "Notes",
          items: [
            "  - With no store, returns all configured sqlite/postgres stores.",
            "  - Use `fide graph status` for local workspace status.",
          ],
        },
      ],
    }));
    return 0;
  }

  if (positionals.length > 1) {
    throw new Error("`store status` accepts at most one positional store.");
  }
  if (positionals.length === 1) {
    if (flags.has("store")) {
      throw new Error("Pass either a positional store or `--store`, not both.");
    }
    flags.set("store", positionals[0]);
  }

  async function statusForTarget(target: ResolvedGraphTarget) {
    if (target.type === "local") {
      throw new Error("`fide store status` only supports configured sqlite/postgres targets. Use `fide graph status` for local workspaces.");
    }

    if (target.type === "postgres") {
      if (!target.databaseUrl) {
        return {
          ok: true,
          storeType: "postgres",
          key: target.key,
          next: nextCommands(target.key, target.recipe),
          configuredFromSettings: target.configuredFromSettings,
          databaseUrlConfigured: false,
          databaseUrlSource: target.databaseUrlSource,
          databaseUrlEnv: target.databaseUrlEnv,
          schema: target.schema,
          recipe: target.recipe,
          lastRunAt: target.runState?.metadata?.lastRunAt,
          lastRunStatementsAdded: target.runState?.metadata?.lastRunStatementsAdded,
          reachable: false,
          missing: ["postgres.connection"],
        };
      }

      const expectedReferenceIdentifierColumns = [
        "identifier_fingerprint",
        "reference_identifier",
      ];
      const expectedStatementsColumns = [
        "statement_fingerprint",
        "subject_type",
        "subject_reference_type",
        "subject_fingerprint",
        "predicate_fingerprint",
        "object_type",
        "object_reference_type",
        "object_fingerprint",
        "created_at",
      ];
      const expectedStatementConstraints = [
        "chk_subject_protocol_self_sourced",
        "chk_object_protocol_self_sourced",
      ];

      const client = createPgClient(target.databaseUrl);
      try {
        await client`SELECT 1`;
        const schemaRows = await client<{ exists: boolean }[]>`
          SELECT EXISTS (
            SELECT 1
            FROM information_schema.schemata
            WHERE schema_name = ${target.schema}
          ) AS exists
        `;
        const schemaExists = Boolean(schemaRows[0]?.exists);
        const typeRows = await client<{ exists: boolean }[]>`
          SELECT EXISTS (
            SELECT 1
            FROM pg_type t
            INNER JOIN pg_namespace n ON t.typnamespace = n.oid
            WHERE t.typname = 'entity_type' AND n.nspname = ${target.schema}
          ) AS exists
        `;
        const entityTypeExists = Boolean(typeRows[0]?.exists);

        const tableRows = schemaExists
          ? await client<{ table_name: string }[]>`
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = ${target.schema}
              AND (
                table_name = ${GRAPH_REFERENCE_IDENTIFIERS_TABLE}
                OR table_name = ${GRAPH_STATEMENTS_TABLE}
              )
            ORDER BY table_name
          `
          : [];
        const presentTables = new Set(tableRows.map((row) => row.table_name));

        const referenceIdentifierColumns = presentTables.has(GRAPH_REFERENCE_IDENTIFIERS_TABLE)
          ? (await client<{ column_name: string }[]>`
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = ${target.schema}
              AND table_name = ${GRAPH_REFERENCE_IDENTIFIERS_TABLE}
            ORDER BY ordinal_position
          `).map((row) => row.column_name)
          : [];
        const statementsColumns = presentTables.has(GRAPH_STATEMENTS_TABLE)
          ? (await client<{ column_name: string }[]>`
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = ${target.schema}
              AND table_name = ${GRAPH_STATEMENTS_TABLE}
            ORDER BY ordinal_position
          `).map((row) => row.column_name)
          : [];
        const statementConstraintRows = presentTables.has(GRAPH_STATEMENTS_TABLE)
          ? await client<{ conname: string }[]>`
            SELECT c.conname
            FROM pg_constraint c
            INNER JOIN pg_class t ON c.conrelid = t.oid
            INNER JOIN pg_namespace n ON t.relnamespace = n.oid
            WHERE n.nspname = ${target.schema}
              AND t.relname = ${GRAPH_STATEMENTS_TABLE}
              AND (
                c.conname = 'chk_subject_protocol_self_sourced'
                OR c.conname = 'chk_object_protocol_self_sourced'
              )
            ORDER BY c.conname
          `
          : [];
        const presentStatementConstraints = new Set(statementConstraintRows.map((row) => row.conname));

        const missing: string[] = [];
        if (!schemaExists) missing.push(`schema.${target.schema}`);
        if (!entityTypeExists) missing.push(`${target.schema}.entity_type`);
        if (!presentTables.has(GRAPH_REFERENCE_IDENTIFIERS_TABLE)) {
          missing.push(`${target.schema}.${GRAPH_REFERENCE_IDENTIFIERS_TABLE}`);
        }
        if (!presentTables.has(GRAPH_STATEMENTS_TABLE)) {
          missing.push(`${target.schema}.${GRAPH_STATEMENTS_TABLE}`);
        }
        const missingReferenceIdentifierColumns = expectedReferenceIdentifierColumns.filter((column) => !referenceIdentifierColumns.includes(column));
        const missingStatementsColumns = expectedStatementsColumns.filter((column) => !statementsColumns.includes(column));
        const missingStatementConstraints = expectedStatementConstraints.filter((name) => !presentStatementConstraints.has(name));
        missing.push(...missingReferenceIdentifierColumns.map((column) => `${target.schema}.${GRAPH_REFERENCE_IDENTIFIERS_TABLE}.${column}`));
        missing.push(...missingStatementsColumns.map((column) => `${target.schema}.${GRAPH_STATEMENTS_TABLE}.${column}`));
        missing.push(...missingStatementConstraints.map((name) => `${target.schema}.${GRAPH_STATEMENTS_TABLE}.${name}`));

        return {
          ok: true,
          storeType: "postgres",
          key: target.key,
          next: nextCommands(target.key, target.recipe),
          configured: true,
          configuredFromSettings: target.configuredFromSettings,
          databaseUrlConfigured: true,
          databaseUrlSource: target.databaseUrlSource,
          databaseUrlEnv: target.databaseUrlEnv,
          schema: target.schema,
          recipe: target.recipe,
          lastRunAt: target.runState?.metadata?.lastRunAt,
          lastRunStatementsAdded: target.runState?.metadata?.lastRunStatementsAdded,
          reachable: true,
          missing,
        };
      } catch (error) {
        return {
          ok: true,
          storeType: "postgres",
          key: target.key,
          next: nextCommands(target.key, target.recipe),
          configured: true,
          configuredFromSettings: target.configuredFromSettings,
          databaseUrlConfigured: true,
          databaseUrlSource: target.databaseUrlSource,
          databaseUrlEnv: target.databaseUrlEnv,
          schema: target.schema,
          recipe: target.recipe,
          lastRunAt: target.runState?.metadata?.lastRunAt,
          lastRunStatementsAdded: target.runState?.metadata?.lastRunStatementsAdded,
          reachable: false,
          missing: ["postgres.connection"],
          error: error instanceof Error ? error.message : String(error),
        };
      } finally {
        await client.end({ timeout: 1 });
      }
    }

    const inspection = await inspectSqliteGraph(target.file);
    return {
      ok: true,
      storeType: "sqlite",
      key: target.key,
      configured: true,
      reachable: inspection.reachable,
      file: target.file,
      recipe: target.recipe,
      lastRunAt: target.runState?.metadata?.lastRunAt,
      lastRunStatementsAdded: target.runState?.metadata?.lastRunStatementsAdded,
      next: nextCommands(target.key, target.recipe),
      missing: inspection.missing,
      error: inspection.error,
      warnings: getSqliteWarnings(target.file, { gitignore: target.gitignore }),
    };
  }

  if (flags.has("store")) {
    printJson(await statusForTarget(resolveStoreTarget(flags)));
    return 0;
  }

  const configuredKeys = listConfiguredStoreTargetKeys();
  const stores = await Promise.all(configuredKeys.map(async (key) => {
    const targetFlags = new Map(flags);
    targetFlags.set("store", key);
    const resolved = resolveStoreTarget(targetFlags);
    const detailed = await statusForTarget(resolved);
    return {
      key,
      storeType: detailed.storeType,
      warnings: "warnings" in detailed ? detailed.warnings : undefined,
      next: {
        statusCommand: `fide store status --store ${key}`,
        sqlHelpCommand: "fide store sql -h",
        sqlCommand: `fide store sql --store ${key} ...`,
        ...(Array.isArray(detailed.recipe) && detailed.recipe.length > 0
          ? {
            materializeHelpCommand: "fide store materialize -h",
            materializeCommand: `fide store materialize --store ${key}`,
          }
          : {}),
      },
    };
  }));

  printJson({
    ok: true,
    stores,
  });
  return 0;
}
