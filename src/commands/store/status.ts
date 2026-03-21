import { createPgClient } from "@chris-test/db";
import { hasFlag, parseArgs } from "../../util/args.js";
import { renderCommandHelp } from "../../util/command-metadata.js";
import { printJson } from "../../util/io.js";
import { GRAPH_REFERENCE_IDENTIFIERS_TABLE, GRAPH_STATEMENTS_TABLE, listConfiguredStoreTargetKeys, resolveStoreTarget, type ResolvedStatementStore } from "../../util/graph/target.js";
import { inspectFideJsonlStore } from "../../util/graph/fide-jsonl.js";
import { inspectSqliteGraph } from "../../util/graph/sqlite.js";
import { getSqliteWarnings } from "../../util/graph/local-disk-warning.js";
import { listConfiguredQueryStoreKeys, resolveQueryStore } from "../../util/query/target.js";
import { graphStoresCommand } from "../graph/metadata.js";

function nextCommands(key: string | null, recipe: unknown, storeType?: "postgres" | "sqlite" | "fide-jsonl"): Record<string, string> | undefined {
  if (!key) return undefined;
  if (storeType === "fide-jsonl") {
    return {
      writeHelpCommand: "fide graph write -h",
      writeCommand: "fide graph write ...",
    };
  }
  const next: Record<string, string> = {
    sqlHelpCommand: "fide graph sql -h",
    sqlCommand: `fide graph sql --store ${key} ...`,
  };
  if (Array.isArray(recipe) && recipe.length > 0) {
    next.buildHelpCommand = "fide graph build -h";
    next.buildCommand = `fide graph build --statements ${key}`;
  }
  return next;
}

export async function runStoreStatus(args: string[] = [], invocation: "graph" | "store" = "graph"): Promise<number> {
  const { flags, positionals } = parseArgs(args);
  if (hasFlag(flags, "help") || hasFlag(flags, "-h")) {
    console.log(renderCommandHelp(graphStoresCommand));
    return 0;
  }

  if (positionals.length > 1) {
    throw new Error("`graph stores` accepts at most one positional store.");
  }
  if (positionals.length === 1) {
    if (flags.has("store")) {
      throw new Error("Pass either a positional store or `--store`, not both.");
    }
    flags.set("store", positionals[0]);
  }

  async function statusForTarget(target: ResolvedStatementStore) {
    if (target.type === "postgres") {
      if (!target.databaseUrl) {
        return {
          ok: true,
          storeType: "postgres",
          key: target.key,
          next: nextCommands(target.key, target.recipe, "postgres"),
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
          next: nextCommands(target.key, target.recipe, "postgres"),
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
          next: nextCommands(target.key, target.recipe, "postgres"),
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

    if (target.type === "fide-jsonl") {
      const inspection = await inspectFideJsonlStore(target.dir);
      return {
        ok: true,
        storeType: "fide-jsonl",
        key: target.key,
        configured: true,
        reachable: inspection.reachable,
        dir: target.dir,
        recipe: target.recipe,
        lastRunAt: target.runState?.metadata?.lastRunAt,
        lastRunStatementsAdded: target.runState?.metadata?.lastRunStatementsAdded,
        next: nextCommands(target.key, target.recipe, "fide-jsonl"),
        missing: inspection.missing,
        error: inspection.error,
      };
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
      next: nextCommands(target.key, target.recipe, "sqlite"),
      missing: inspection.missing,
      error: inspection.error,
      warnings: getSqliteWarnings(target.file, { gitignore: target.gitignore }),
    };
  }

  async function statusForQueryStore(key: string) {
    const queryFlags = new Map<string, string | boolean>([["query-store", key]]);
    const store = resolveQueryStore(queryFlags);
    if (!store.databaseUrl) {
      return {
        ok: true,
        storeType: "postgres",
        key: store.key,
        next: {
          buildHelpCommand: "fide graph build -h",
          buildCommand: `fide graph build --queries ${store.key}`,
        },
        configured: true,
        databaseUrlConfigured: false,
        databaseUrlSource: store.databaseUrlSource,
        databaseUrlEnv: store.databaseUrlEnv,
        schema: store.schema,
        reachable: false,
        missing: ["postgres.connection"],
      };
    }

    const client = createPgClient(store.databaseUrl);
    try {
      await client`SELECT 1`;
      const schemaRows = await client<{ exists: boolean }[]>`
        SELECT EXISTS (
          SELECT 1
          FROM information_schema.schemata
          WHERE schema_name = ${store.schema}
        ) AS exists
      `;
      const schemaExists = Boolean(schemaRows[0]?.exists);
      const tableRows = schemaExists
        ? await client<{ table_name: string }[]>`
          SELECT table_name
          FROM information_schema.tables
          WHERE table_schema = ${store.schema}
            AND (
              table_name = 'queries'
              OR table_name = 'query_runs'
            )
          ORDER BY table_name
        `
        : [];
      const presentTables = new Set(tableRows.map((row) => row.table_name));
      const missing: string[] = [];
      if (!schemaExists) missing.push(`schema.${store.schema}`);
      if (!presentTables.has("queries")) missing.push(`${store.schema}.queries`);
      if (!presentTables.has("query_runs")) missing.push(`${store.schema}.query_runs`);
      return {
        ok: true,
        storeType: "postgres",
        key: store.key,
        next: {
          buildHelpCommand: "fide graph build -h",
          buildCommand: `fide graph build --queries ${store.key}`,
        },
        configured: true,
        databaseUrlConfigured: true,
        databaseUrlSource: store.databaseUrlSource,
        databaseUrlEnv: store.databaseUrlEnv,
        schema: store.schema,
        reachable: true,
        missing,
      };
    } catch (error) {
      return {
        ok: true,
        storeType: "postgres",
        key: store.key,
        next: {
          buildHelpCommand: "fide graph build -h",
          buildCommand: `fide graph build --queries ${store.key}`,
        },
        configured: true,
        databaseUrlConfigured: true,
        databaseUrlSource: store.databaseUrlSource,
        databaseUrlEnv: store.databaseUrlEnv,
        schema: store.schema,
        reachable: false,
        missing: ["postgres.connection"],
        error: error instanceof Error ? error.message : String(error),
      };
    } finally {
      await client.end({ timeout: 1 });
    }
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
        statusCommand: `fide graph stores --store ${key}`,
        ...(("storeType" in detailed && detailed.storeType === "fide-jsonl")
          ? {
            writeHelpCommand: "fide graph write -h",
            writeCommand: "fide graph write ...",
          }
          : {
            sqlHelpCommand: "fide graph sql -h",
            sqlCommand: `fide graph sql --store ${key} ...`,
          }),
        ...(Array.isArray(detailed.recipe) && detailed.recipe.length > 0 && detailed.storeType !== "fide-jsonl"
          ? {
            buildHelpCommand: "fide graph build -h",
            buildCommand: `fide graph build --statements ${key}`,
          }
          : {}),
      },
    };
  }));

  const queryStoreKeys = listConfiguredQueryStoreKeys();
  const queryStores = await Promise.all(queryStoreKeys.map(async (key) => {
    const detailed = await statusForQueryStore(key);
    return {
      key,
      storeType: detailed.storeType,
      next: detailed.next,
    };
  }));

  printJson({
    ok: true,
    stores,
    queryStores,
  });
  return 0;
}
