import { createPgClient } from "@chris-test/db";
import { type QueryDefinition } from "./files.js";
import { type ResolvedQueryStore } from "./target.js";

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
        graph_key TEXT NOT NULL,
        name TEXT NOT NULL,
        sql TEXT NOT NULL,
        description TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (graph_key, name)
      );
    `);
    await client.unsafe(`
      CREATE TABLE IF NOT EXISTS ${schema}."query_runs" (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        graph_key TEXT NOT NULL,
        query_name TEXT NOT NULL,
        sql TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL CHECK (status IN ('running', 'success', 'error')),
        row_count INTEGER,
        result_json JSONB,
        started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        finished_at TIMESTAMPTZ,
        FOREIGN KEY (graph_key, query_name)
          REFERENCES ${queriesTableQualified}(graph_key, name)
          ON DELETE CASCADE
      );
    `);
  } finally {
    await client.end({ timeout: 1 });
  }
}

export async function replaceQueryStoreQueries(store: ResolvedQueryStore, queries: QueryDefinition[]): Promise<number> {
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
          INSERT INTO "queries" (name, graph_key, sql, description)
          VALUES ($1, $2, $3, $4)
          `,
          [query.name, query.graphKey, query.sql, query.description],
        );
      }
      return queries.length;
    });
  } finally {
    await client.end({ timeout: 1 });
  }
}
