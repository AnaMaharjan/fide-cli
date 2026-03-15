import { createPgClient } from "@chris-test/db";
import { type FideSettings, type QueryStoreSettings } from "./graph/target.js";
import { ensureFideEnvLoaded, readJsonFile, resolveSettingsPath } from "./fide-dir.js";
import { readLocalQueries, type LocalQueryDefinition } from "./query-files.js";

export type ResolvedQueryStore = {
  type: "postgres";
  key: string;
  databaseUrl: string | null;
  databaseUrlSource: "connection" | "connection-env" | null;
  databaseUrlEnv: string | null;
  schema: string;
};

function readSettings(root: string = process.cwd()): FideSettings | null {
  return readJsonFile<FideSettings>(resolveSettingsPath(root));
}

function resolveDatabaseUrl(connection: string | undefined): {
  databaseUrl: string | null;
  databaseUrlSource: "connection" | "connection-env" | null;
  databaseUrlEnv: string | null;
} {
  if (!connection) {
    return { databaseUrl: null, databaseUrlSource: null, databaseUrlEnv: null };
  }
  if (connection.startsWith("postgres://") || connection.startsWith("postgresql://")) {
    return { databaseUrl: connection, databaseUrlSource: "connection", databaseUrlEnv: null };
  }
  const envValue = process.env[connection] ?? null;
  return {
    databaseUrl: envValue,
    databaseUrlSource: envValue ? "connection-env" : null,
    databaseUrlEnv: connection,
  };
}

export function resolveQueryStore(flags: Map<string, string | boolean>, root: string = process.cwd()): ResolvedQueryStore {
  ensureFideEnvLoaded();
  const settings = readSettings(root);
  const requested = typeof flags.get("query-store") === "string" ? String(flags.get("query-store")) : null;
  const key = requested ?? Object.keys(settings?.queryStores ?? {})[0] ?? null;
  if (!key) {
    throw new Error("No configured query store found in settings.json.");
  }

  const store = settings?.queryStores?.[key] as QueryStoreSettings | undefined;
  if (!store) {
    throw new Error(`Unknown query store in settings.json: ${key}`);
  }

  const resolved = resolveDatabaseUrl(store.connection);
  return {
    type: "postgres",
    key,
    schema: store.schema,
    ...resolved,
  };
}

export async function ensureQueryStoreSchema(store: ResolvedQueryStore): Promise<void> {
  if (!store.databaseUrl) {
    throw new Error(`Missing postgres connection for query store "${store.key}". Configure the store in settings.json or set the referenced env var.`);
  }
  const client = createPgClient(store.databaseUrl);
  const schema = `"${store.schema.replaceAll("\"", "\"\"")}"`;
  const queriesTableQualified = `${schema}."queries"`;
  try {
    await client.unsafe(`CREATE SCHEMA IF NOT EXISTS ${schema};`);
    await client.unsafe(`
      CREATE TABLE IF NOT EXISTS ${queriesTableQualified} (
        name TEXT PRIMARY KEY,
        statement_store_key TEXT NOT NULL,
        sql TEXT NOT NULL,
        description TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await client.unsafe(`
      CREATE TABLE IF NOT EXISTS ${schema}."query_runs" (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        query_name TEXT REFERENCES ${queriesTableQualified}(name) ON DELETE CASCADE,
        statement_store_key TEXT NOT NULL,
        sql TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL CHECK (status IN ('running', 'success', 'error')),
        row_count INTEGER,
        result_json JSONB,
        started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        finished_at TIMESTAMPTZ
      );
    `);
  } finally {
    await client.end({ timeout: 1 });
  }
}

export async function replaceQueryStoreQueries(store: ResolvedQueryStore, queries: LocalQueryDefinition[]): Promise<number> {
  if (!store.databaseUrl) {
    throw new Error(`Missing postgres connection for query store "${store.key}". Configure the store in settings.json or set the referenced env var.`);
  }
  await ensureQueryStoreSchema(store);
  const client = createPgClient(store.databaseUrl);
  try {
    return await client.begin(async (tx) => {
      const schema = `"${store.schema.replaceAll("\"", "\"\"")}"`;
      await tx.unsafe(`SET LOCAL search_path TO ${schema};`);
      await tx.unsafe(`DELETE FROM "queries";`);
      for (const query of queries) {
        await tx.unsafe(
          `
          INSERT INTO "queries" (name, statement_store_key, sql, description)
          VALUES ($1, $2, $3, $4)
          `,
          [query.name, query.statementStoreKey, query.sql, query.description],
        );
      }
      return queries.length;
    });
  } finally {
    await client.end({ timeout: 1 });
  }
}

export async function readLocalQueryDefinitions(root: string): Promise<LocalQueryDefinition[]> {
  return readLocalQueries(root);
}
