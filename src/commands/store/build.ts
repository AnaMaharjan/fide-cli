import { readFile, writeFile } from "node:fs/promises";
import { createPgClient } from "@chris-test/db";
import { getStringFlag, hasFlag, parseArgs, shouldUseJsonOutput } from "../../util/args.js";
import { renderCommandHelp } from "../../util/command-metadata.js";
import { printJson } from "../../util/io.js";
import { GRAPH_REFERENCE_IDENTIFIERS_TABLE, GRAPH_ROOTS_TABLE, GRAPH_STATEMENT_ROOTS_TABLE, GRAPH_STATEMENTS_TABLE, resolveGraphTarget, resolveStoreTarget, validateGraphSettings, type FideSettings, type GraphRecipeStep, type ResolvedStatementStore } from "../../util/graph/target.js";
import { queryFideJsonlResolvedStatements } from "../../util/graph/fide-jsonl.js";
import {
  appendSqliteGraphFromResolvedStatements,
  ensureSqliteGraphSchema,
  querySqliteResolvedStatements,
  replaceSqliteGraphFromResolvedStatements,
  type ResolvedStatementRow,
} from "../../util/graph/sqlite.js";
import { getSqliteWarnings } from "../../util/graph/local-disk-warning.js";
import { readJsonFile, resolveSettingsPath } from "../../util/fide-dir.js";
import { readLocalQueries } from "../../util/query/files.js";
import { replaceQueryStoreQueries } from "../../util/query/postgres.js";
import { resolveQueryStore } from "../../util/query/target.js";
import { graphBuildCommand } from "../graph/metadata.js";

function printBuildProgress(flags: Map<string, string | boolean>, message: string): void {
  if (shouldUseJsonOutput(flags)) return;
  console.log(message);
}

function quoteIdent(value: string): string {
  return `"${value.replaceAll("\"", "\"\"")}"`;
}

function buildHelp(commandName = "fide graph build"): string {
  void commandName;
  return renderCommandHelp(graphBuildCommand);
}

function escapeSqlString(value: string): string {
  return value.replaceAll("'", "''");
}

function renderRecipeSql(sql: string, lastRunAt: string | null): string {
  const resolvedLastRunAt = lastRunAt ?? "1970-01-01T00:00:00.000Z";
  return sql.replaceAll("$lastRunAt", `'${escapeSqlString(resolvedLastRunAt)}'`);
}

async function writeStoreRunState(key: string, lastRunAt: string, lastRunStatementsAdded: number): Promise<void> {
  const settingsPath = resolveSettingsPath(process.cwd());
  const current = readJsonFile<FideSettings>(settingsPath) ?? {};
  current.statementStores = current.statementStores ?? {};
  const store = current.statementStores[key];
  if (!store) {
    throw new Error(`Unknown store in settings.json: ${key}`);
  }
  current.statementStores[key] = {
    ...store,
    metadata: {
      lastRunAt,
      lastRunStatementsAdded,
    },
  };
  validateGraphSettings(current);
  await writeFile(settingsPath, `${JSON.stringify(current, null, 2)}\n`, "utf8");
}

function assertRecipeTarget(target: ResolvedStatementStore): asserts target is Extract<ResolvedStatementStore, { type: "postgres" | "sqlite" }> {
  if (!target.recipe || target.recipe.length === 0) {
    throw new Error(`Store "${target.key ?? "unknown"}" has no recipe.`);
  }
}

function sameGraphLocation(a: ResolvedStatementStore, b: ResolvedStatementStore): boolean {
  if (a.type !== b.type) return false;
  if (a.type === "sqlite" && b.type === "sqlite") return a.file === b.file;
  if (a.type === "postgres" && b.type === "postgres") return a.databaseUrl === b.databaseUrl && a.schema === b.schema;
  if (a.type === "fide-jsonl" && b.type === "fide-jsonl") return a.dir === b.dir;
  return false;
}

const POSTGRES_STATEMENT_BATCH_SIZE = 1000;

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

async function queryPostgresResolvedStatements(databaseUrl: string, schema: string, sql: string): Promise<ResolvedStatementRow[]> {
  const client = createPgClient(databaseUrl);
  try {
    return await client.begin(async (tx) => {
      await tx.unsafe(`SET LOCAL search_path TO ${quoteIdent(schema)};`);
      return tx.unsafe(`
        WITH selected AS (${sql})
        SELECT
          s.statement_fingerprint,
          s.subject_type,
          s.subject_reference_type,
          s.subject_fingerprint,
          s.predicate_fingerprint,
          s.object_type,
          s.object_reference_type,
          s.object_fingerprint,
          s.created_at,
          subj.reference_identifier AS subject_reference_identifier,
          pred.reference_identifier AS predicate_reference_identifier,
          obj.reference_identifier AS object_reference_identifier,
          COALESCE(array_agg(DISTINCT sr.root) FILTER (WHERE sr.root IS NOT NULL), '{}') AS roots
        FROM selected s
        INNER JOIN reference_identifiers subj ON subj.identifier_fingerprint = s.subject_fingerprint
        INNER JOIN reference_identifiers pred ON pred.identifier_fingerprint = s.predicate_fingerprint
        INNER JOIN reference_identifiers obj ON obj.identifier_fingerprint = s.object_fingerprint
        LEFT JOIN statement_roots sr ON sr.statement_fingerprint = s.statement_fingerprint
        GROUP BY
          s.statement_fingerprint,
          s.subject_type,
          s.subject_reference_type,
          s.subject_fingerprint,
          s.predicate_fingerprint,
          s.object_type,
          s.object_reference_type,
          s.object_fingerprint,
          s.created_at,
          subj.reference_identifier,
          pred.reference_identifier,
          obj.reference_identifier
      `) as Promise<ResolvedStatementRow[]>;
    });
  } finally {
    await client.end({ timeout: 1 });
  }
}

async function ensurePostgresGraphSchema(databaseUrl: string, schema: string): Promise<void> {
  const client = createPgClient(databaseUrl, { suppressNotices: true });
  try {
    await client.begin(async (tx) => {
      await tx.unsafe(`CREATE SCHEMA IF NOT EXISTS ${quoteIdent(schema)};`);
      await tx.unsafe(`SET LOCAL search_path TO ${quoteIdent(schema)};`);
      await tx.unsafe(`
        DO $$
        BEGIN
          CREATE TYPE entity_type AS ENUM (
            '00',
            '10',
            '11',
            '12',
            '20',
            '21',
            '22',
            '30',
            '31',
            '40',
            '41',
            '42',
            '43',
            'a0',
            'a1',
            'a2',
            'a3',
            'a4',
            'a5',
            'a6',
            'a7',
            'a8',
            'a9'
          );
        EXCEPTION
          WHEN duplicate_object THEN NULL;
        END
        $$;
      `);
      await tx.unsafe(`
        CREATE TABLE IF NOT EXISTS ${quoteIdent(GRAPH_REFERENCE_IDENTIFIERS_TABLE)} (
          identifier_fingerprint CHAR(36) PRIMARY KEY,
          reference_identifier TEXT NOT NULL
        );
      `);
      await tx.unsafe(`
        CREATE TABLE IF NOT EXISTS ${quoteIdent(GRAPH_STATEMENTS_TABLE)} (
          statement_fingerprint CHAR(36) PRIMARY KEY,
          subject_type entity_type NOT NULL,
          subject_reference_type entity_type NOT NULL,
          subject_fingerprint CHAR(36) NOT NULL,
          predicate_fingerprint CHAR(36) NOT NULL,
          object_type entity_type NOT NULL,
          object_reference_type entity_type NOT NULL,
          object_fingerprint CHAR(36) NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          CONSTRAINT chk_subject_protocol_self_sourced CHECK (
            (subject_type = '00' AND subject_reference_type = '00') OR
            (subject_type <> '00' AND subject_reference_type <> '00')
          ),
          CONSTRAINT chk_object_protocol_self_sourced CHECK (
            (object_type = '00' AND object_reference_type = '00') OR
            (object_type <> '00' AND object_reference_type <> '00')
          )
        );
      `);
      await tx.unsafe(`
        CREATE TABLE IF NOT EXISTS ${quoteIdent(GRAPH_ROOTS_TABLE)} (
          root TEXT PRIMARY KEY,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);
      await tx.unsafe(`
        CREATE TABLE IF NOT EXISTS ${quoteIdent(GRAPH_STATEMENT_ROOTS_TABLE)} (
          root TEXT NOT NULL,
          statement_fingerprint CHAR(36) NOT NULL,
          PRIMARY KEY (root, statement_fingerprint)
        );
      `);
    });
  } finally {
    await client.end({ timeout: 1 });
  }
}

async function clearPostgresGraph(databaseUrl: string, schema: string): Promise<void> {
  const client = createPgClient(databaseUrl);
  try {
    await client.begin(async (tx) => {
      await tx.unsafe(`SET LOCAL search_path TO ${quoteIdent(schema)};`);
      await tx.unsafe(`DELETE FROM ${quoteIdent(GRAPH_STATEMENT_ROOTS_TABLE)};`);
      await tx.unsafe(`DELETE FROM ${quoteIdent(GRAPH_ROOTS_TABLE)};`);
      await tx.unsafe(`DELETE FROM ${quoteIdent(GRAPH_STATEMENTS_TABLE)};`);
      await tx.unsafe(`DELETE FROM ${quoteIdent(GRAPH_REFERENCE_IDENTIFIERS_TABLE)};`);
    });
  } finally {
    await client.end({ timeout: 1 });
  }
}

async function appendResolvedStatementsToPostgres(databaseUrl: string, schema: string, statements: ResolvedStatementRow[]): Promise<number> {
  const client = createPgClient(databaseUrl);
  try {
    return await client.begin(async (tx) => {
      await tx.unsafe(`SET LOCAL search_path TO ${quoteIdent(schema)};`);
      for (const batch of chunkArray(statements, POSTGRES_STATEMENT_BATCH_SIZE)) {
        const referenceIdentifiers = Array.from(
          new Map(
            batch.flatMap((statement) => ([
              [statement.subject_fingerprint, statement.subject_reference_identifier],
              [statement.predicate_fingerprint, statement.predicate_reference_identifier],
              [statement.object_fingerprint, statement.object_reference_identifier],
            ])).map(([fingerprint, referenceIdentifier]) => [
              fingerprint,
              { fingerprint, referenceIdentifier },
            ]),
          ).values(),
        );

        if (referenceIdentifiers.length > 0) {
          const referenceValuesSql = referenceIdentifiers
            .map((_, index) => `($${index * 2 + 1}, $${index * 2 + 2})`)
            .join(", ");
          const referenceValues = referenceIdentifiers.flatMap((item) => [
            item.fingerprint,
            item.referenceIdentifier,
          ]);
          await tx.unsafe(
            `INSERT INTO ${quoteIdent(GRAPH_REFERENCE_IDENTIFIERS_TABLE)} (identifier_fingerprint, reference_identifier)
             VALUES ${referenceValuesSql}
             ON CONFLICT (identifier_fingerprint) DO NOTHING`,
            referenceValues,
          );
        }

        if (batch.length > 0) {
          const roots = Array.from(
            new Set(batch.flatMap((statement) => statement.roots)),
          );
          if (roots.length > 0) {
            const rootValuesSql = roots
              .map((_, index) => `($${index + 1})`)
              .join(", ");
            await tx.unsafe(
              `INSERT INTO ${quoteIdent(GRAPH_ROOTS_TABLE)} (root)
               VALUES ${rootValuesSql}
               ON CONFLICT (root) DO NOTHING`,
              roots,
            );
          }

          const statementRoots = batch.flatMap((statement) =>
            statement.roots.map((root) => ({
              root,
              statementFingerprint: statement.statement_fingerprint,
            })),
          );
          if (statementRoots.length > 0) {
            const statementRootValuesSql = statementRoots
              .map((_, index) => {
                const offset = index * 2;
                return `($${offset + 1}, $${offset + 2})`;
              })
              .join(", ");
            const statementRootValues = statementRoots.flatMap((item) => [
              item.root,
              item.statementFingerprint,
            ]);
            await tx.unsafe(
              `INSERT INTO ${quoteIdent(GRAPH_STATEMENT_ROOTS_TABLE)} (root, statement_fingerprint)
               VALUES ${statementRootValuesSql}
               ON CONFLICT (root, statement_fingerprint) DO NOTHING`,
              statementRootValues,
            );
          }

          const statementValuesSql = batch
            .map((_, index) => {
              const offset = index * 9;
              return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9})`;
            })
            .join(", ");
          const statementValues = batch.flatMap((statement) => [
            statement.statement_fingerprint,
            statement.subject_type,
            statement.subject_reference_type,
            statement.subject_fingerprint,
            statement.predicate_fingerprint,
            statement.object_type,
            statement.object_reference_type,
            statement.object_fingerprint,
            statement.created_at,
          ]);
          await tx.unsafe(
            `INSERT INTO ${quoteIdent(GRAPH_STATEMENTS_TABLE)} (
              statement_fingerprint, subject_type, subject_reference_type, subject_fingerprint,
              predicate_fingerprint, object_type, object_reference_type, object_fingerprint, created_at
            ) VALUES ${statementValuesSql}
            ON CONFLICT (statement_fingerprint) DO NOTHING`,
            statementValues,
          );
        }
      }
      return statements.length;
    });
  } finally {
    await client.end({ timeout: 1 });
  }
}

async function queryRecipeStep(step: GraphRecipeStep, lastRunAt: string | null): Promise<{ source: ResolvedStatementStore; rows: ResolvedStatementRow[] }> {
  const source = resolveStoreTarget(new Map<string, string | boolean>([["store", step.from]]));
  const sql = typeof step.sql === "string" ? renderRecipeSql(step.sql, lastRunAt) : null;

  if (source.type === "fide-jsonl") {
    if (sql) throw new Error(`Recipe source "${step.from}" is a fide-jsonl store and cannot run SQL. Remove the sql field from that recipe step.`);
    return {
      source,
      rows: await queryFideJsonlResolvedStatements(source.dir, {
        fromDateUTC: step.fromDateUTC,
        toDateUTC: step.toDateUTC,
        lastRunAt,
      }),
    };
  }
  if (!sql) throw new Error(`Recipe source "${step.from}" requires sql.`);
  if (source.type === "postgres") {
    if (!source.databaseUrl) throw new Error(`Missing postgres connection for recipe source "${step.from}".`);
    await ensurePostgresGraphSchema(source.databaseUrl, source.schema);
    return { source, rows: await queryPostgresResolvedStatements(source.databaseUrl, source.schema, sql) };
  }
  await ensureSqliteGraphSchema(source.file, { drop: false });
  return { source, rows: await querySqliteResolvedStatements(source.file, sql) };
}

export async function runStoreBuild(args: string[], invocation: "graph" | "store" = "graph"): Promise<number> {
  const parsed = parseArgs(args);
  const flags = parsed.flags;
  if (hasFlag(flags, "help") || hasFlag(flags, "-h")) {
    console.log(buildHelp("fide graph build"));
    return 0;
  }
  if (flags.has("store") || flags.has("query-store")) {
    throw new Error("This command now uses `--statements <name>` or `--queries <name>`, not `--store` or `--query-store`.");
  }
  if (flags.has("queries")) {
    const queryFlags = new Map<string, string | boolean>(flags);
    queryFlags.set("query-store", String(flags.get("queries")));
    const queryStore = resolveQueryStore(queryFlags);
    const graphTarget = resolveGraphTarget(flags);
    const queries = await readLocalQueries(graphTarget.root);
    const queryCount = await replaceQueryStoreQueries(queryStore, queries);
    const payload = {
      ok: true,
      storeType: "postgres",
      key: queryStore.key,
      schema: queryStore.schema,
      queryCount,
    };
    if (shouldUseJsonOutput(flags)) {
      printJson(payload);
    } else {
      console.log(JSON.stringify(payload, null, 2));
    }
    return 0;
  }

  if (!flags.has("statements")) throw new Error("Missing required flag: --statements <name> or --queries <name>.");

  const statementFlags = new Map<string, string | boolean>(flags);
  statementFlags.set("store", String(flags.get("statements")));

  const target = resolveStoreTarget(statementFlags);
  assertRecipeTarget(target);
  const recipe = target.recipe;
  if (!recipe) throw new Error(`Store "${target.key ?? "unknown"}" has no recipe.`);
  const previousLastRunAt = target.runState?.metadata?.lastRunAt ?? null;
  printBuildProgress(flags, `Building statement store ${JSON.stringify(target.key ?? "unknown")}...`);

  for (const step of recipe) {
    const source = resolveStoreTarget(new Map<string, string | boolean>([["store", step.from]]));
    if (sameGraphLocation(target, source)) {
      throw new Error(`Store "${target.key ?? "unknown"}" recipe step source "${step.from}" points at the same physical store as the destination store.`);
    }
  }

  if (target.type === "postgres") {
    if (!target.databaseUrl) throw new Error(`Missing postgres connection for store "${target.key ?? "unknown"}".`);
    printBuildProgress(flags, `Preparing postgres schema ${JSON.stringify(target.schema)}...`);
    await ensurePostgresGraphSchema(target.databaseUrl, target.schema);
    printBuildProgress(flags, "Clearing existing destination statements...");
    await clearPostgresGraph(target.databaseUrl, target.schema);
  } else {
    printBuildProgress(flags, `Preparing sqlite store ${JSON.stringify(target.file)}...`);
    await ensureSqliteGraphSchema(target.file, { drop: false });
    printBuildProgress(flags, "Clearing existing destination statements...");
    await replaceSqliteGraphFromResolvedStatements(target.file, []);
  }

  const steps: Array<{ from: string; statementCount: number }> = [];
  let totalStatementCount = 0;
  const seen = new Set<string>();

  for (const step of recipe) {
    printBuildProgress(flags, `Running recipe step from ${JSON.stringify(step.from)}...`);
    const { rows } = await queryRecipeStep(step, previousLastRunAt);
    const uniqueRows = rows.filter((row) => {
      if (seen.has(row.statement_fingerprint)) return false;
      seen.add(row.statement_fingerprint);
      return true;
    });
    if (target.type === "postgres") {
      if (!target.databaseUrl) throw new Error(`Missing postgres connection for store "${target.key ?? "unknown"}".`);
      await appendResolvedStatementsToPostgres(target.databaseUrl, target.schema, uniqueRows);
    } else {
      await appendSqliteGraphFromResolvedStatements(target.file, uniqueRows);
    }
    steps.push({ from: step.from, statementCount: uniqueRows.length });
    totalStatementCount += uniqueRows.length;
    printBuildProgress(flags, `Added ${uniqueRows.length} statements from ${JSON.stringify(step.from)}.`);
  }

  const lastRunAt = new Date().toISOString();
  const payload = target.type === "postgres"
    ? { ok: true, storeType: "postgres", key: target.key, schema: target.schema, statementCount: totalStatementCount, steps, lastRunAt }
    : { ok: true, storeType: "sqlite", key: target.key, file: target.file, statementCount: totalStatementCount, steps, lastRunAt, warnings: getSqliteWarnings(target.file, { gitignore: target.gitignore }) };

  if (target.key) await writeStoreRunState(target.key, lastRunAt, totalStatementCount);

  if (shouldUseJsonOutput(flags)) {
    printJson(payload);
  } else {
    console.log(JSON.stringify(payload, null, 2));
  }
  return 0;
}
