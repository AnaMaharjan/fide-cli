import { readFile, writeFile } from "node:fs/promises";
import { createPgClient } from "@chris-test/db";
import { getStringFlag, hasFlag, parseArgs, shouldUseJsonOutput } from "../../util/args.js";
import { renderHelp } from "../../util/help.js";
import { applyFieldMask, printJson } from "../../util/io.js";
import { GRAPH_REFERENCE_IDENTIFIERS_TABLE, GRAPH_STATEMENTS_TABLE, resolveGraphTarget, resolveStoreTarget, validateGraphSettings, type FideSettings, type GraphRecipeStep, type ResolvedStatementStore } from "../../util/graph/target.js";
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

function quoteIdent(value: string): string {
  return `"${value.replaceAll("\"", "\"\"")}"`;
}

function buildHelp(): string {
  return renderHelp({
    sections: [
      {
        title: "Usage",
        items: [
          "  fide store build --statements <name>",
          "  fide store build --queries <name>",
        ],
      },
      {
        title: "Flags",
        items: [
          "  --statements <name>      Configured statement store name with a recipe",
          "  --queries <name>         Configured query store name",
          "  --fields <mask>          Output field mask (e.g. storeType,statementCount,steps)",
          "  --pretty, -p             Human-readable output",
        ],
      },
      {
        title: "Examples",
        items: [
          "  fide store build --statements sqlite",
          "  fide store build --statements combined",
          "  fide store build --queries postgresQueries",
        ],
      },
      {
        title: "Notes",
        items: [
          "  - Recipe SQL may include $lastRunAt for incremental runs.",
          "  - On the first run, $lastRunAt resolves to 1970-01-01T00:00:00.000Z.",
          "  - Local fide-jsonl recipe steps may use fromDateUTC/toDateUTC; these apply at UTC date granularity based on .fide/statements/YYYY/MM/DD folders.",
          "  - Query-store builds load local .fide/queries/<statement-store>/<name>.sql files.",
        ],
      },
    ],
  });
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
          obj.reference_identifier AS object_reference_identifier
        FROM selected s
        INNER JOIN reference_identifiers subj ON subj.identifier_fingerprint = s.subject_fingerprint
        INNER JOIN reference_identifiers pred ON pred.identifier_fingerprint = s.predicate_fingerprint
        INNER JOIN reference_identifiers obj ON obj.identifier_fingerprint = s.object_fingerprint
      `) as Promise<ResolvedStatementRow[]>;
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
      for (const statement of statements) {
        await tx.unsafe(
          `INSERT INTO ${quoteIdent(GRAPH_REFERENCE_IDENTIFIERS_TABLE)} (identifier_fingerprint, reference_identifier)
           VALUES ($1, $2)
           ON CONFLICT (identifier_fingerprint) DO NOTHING`,
          [statement.subject_fingerprint, statement.subject_reference_identifier],
        );
        await tx.unsafe(
          `INSERT INTO ${quoteIdent(GRAPH_REFERENCE_IDENTIFIERS_TABLE)} (identifier_fingerprint, reference_identifier)
           VALUES ($1, $2)
           ON CONFLICT (identifier_fingerprint) DO NOTHING`,
          [statement.predicate_fingerprint, statement.predicate_reference_identifier],
        );
        await tx.unsafe(
          `INSERT INTO ${quoteIdent(GRAPH_REFERENCE_IDENTIFIERS_TABLE)} (identifier_fingerprint, reference_identifier)
           VALUES ($1, $2)
           ON CONFLICT (identifier_fingerprint) DO NOTHING`,
          [statement.object_fingerprint, statement.object_reference_identifier],
        );
        await tx.unsafe(
          `INSERT INTO ${quoteIdent(GRAPH_STATEMENTS_TABLE)} (
            statement_fingerprint, subject_type, subject_reference_type, subject_fingerprint,
            predicate_fingerprint, object_type, object_reference_type, object_fingerprint, created_at
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
          ON CONFLICT (statement_fingerprint) DO NOTHING`,
          [
            statement.statement_fingerprint,
            statement.subject_type,
            statement.subject_reference_type,
            statement.subject_fingerprint,
            statement.predicate_fingerprint,
            statement.object_type,
            statement.object_reference_type,
            statement.object_fingerprint,
            statement.created_at,
          ],
        );
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
    return { source, rows: await queryPostgresResolvedStatements(source.databaseUrl, source.schema, sql) };
  }
  return { source, rows: await querySqliteResolvedStatements(source.file, sql) };
}

export async function runStoreBuild(args: string[]): Promise<number> {
  const parsed = parseArgs(args);
  const flags = parsed.flags;
  if (hasFlag(flags, "help") || hasFlag(flags, "-h")) {
    console.log(buildHelp());
    return 0;
  }
  if (flags.has("store") || flags.has("query-store")) {
    throw new Error("`fide store build` now uses `--statements <name>` or `--queries <name>`, not `--store` or `--query-store`.");
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
      printJson(applyFieldMask(payload, getStringFlag(flags, "fields")));
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

  for (const step of recipe) {
    const source = resolveStoreTarget(new Map<string, string | boolean>([["store", step.from]]));
    if (sameGraphLocation(target, source)) {
      throw new Error(`Store "${target.key ?? "unknown"}" recipe step source "${step.from}" points at the same physical store as the destination store.`);
    }
  }

  if (target.type === "postgres") {
    if (!target.databaseUrl) throw new Error(`Missing postgres connection for store "${target.key ?? "unknown"}".`);
    await clearPostgresGraph(target.databaseUrl, target.schema);
  } else {
    await ensureSqliteGraphSchema(target.file, { drop: false });
    await replaceSqliteGraphFromResolvedStatements(target.file, []);
  }

  const steps: Array<{ from: string; statementCount: number }> = [];
  let totalStatementCount = 0;
  const seen = new Set<string>();

  for (const step of recipe) {
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
  }

  const lastRunAt = new Date().toISOString();
  const payload = target.type === "postgres"
    ? { ok: true, storeType: "postgres", key: target.key, schema: target.schema, statementCount: totalStatementCount, steps, lastRunAt }
    : { ok: true, storeType: "sqlite", key: target.key, file: target.file, statementCount: totalStatementCount, steps, lastRunAt, warnings: getSqliteWarnings(target.file, { gitignore: target.gitignore }) };

  if (target.key) await writeStoreRunState(target.key, lastRunAt, totalStatementCount);

  if (shouldUseJsonOutput(flags)) {
    printJson(applyFieldMask(payload, getStringFlag(flags, "fields")));
  } else {
    console.log(JSON.stringify(payload, null, 2));
  }
  return 0;
}
