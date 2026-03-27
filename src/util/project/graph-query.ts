import { createPgClient } from "@chris-test/graph-storage";
import { type ResolvedGraphStore } from "@chris-test/graph";
import { executeSqliteQuery } from "./sqlite-graph-storage.js";

function quoteIdent(value: string): string {
  return `"${value.replaceAll("\"", "\"\"")}"`;
}

export type ExecuteGraphQueryInput = {
  target: Exclude<ResolvedGraphStore, { type: "fide-jsonl" }>;
  sql: string;
};

export type ExecuteGraphQueryResult =
  | {
      ok: true;
      graphStoreType: "postgres";
      key: string | null;
      schema: string;
      rowCount: number;
      rows: unknown[];
    }
  | {
      ok: true;
      graphStoreType: "sqlite";
      key: string | null;
      file: string;
      rowCount: number;
      rows: unknown[];
    };

export async function executeGraphQuery(input: ExecuteGraphQueryInput): Promise<ExecuteGraphQueryResult> {
  const { target, sql } = input;

  if (target.type === "postgres") {
    if (!target.databaseUrl) {
      throw new Error(
        `Missing postgres connection for store "${target.key ?? "unknown"}". Configure .fide/graphs/<graphKey>/config.json or set the referenced env var.`,
      );
    }
    const client = createPgClient(target.databaseUrl);
    try {
      const rows = await client.begin(async (tx) => {
        await tx.unsafe(`SET LOCAL search_path TO ${quoteIdent(target.schema)};`);
        return tx.unsafe(sql) as Promise<unknown[]>;
      });
      return {
        ok: true,
        graphStoreType: "postgres",
        key: target.key,
        schema: target.schema,
        rowCount: rows.length,
        rows,
      };
    } finally {
      await client.end({ timeout: 1 });
    }
  }

  const result = await executeSqliteQuery(target.file, sql);
  return {
    ok: true,
    graphStoreType: "sqlite",
    key: target.key,
    file: target.file,
    rowCount: result.rows.length,
    rows: result.rows,
  };
}
