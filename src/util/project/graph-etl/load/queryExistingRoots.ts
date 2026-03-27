import { createPgClient } from "../../graph-clients/postgres.js";

type StoreTarget =
  | { type: "sqlite"; file: string }
  | { type: "postgres"; databaseUrl?: string | null; schema: string };

type SqliteModule = typeof import("node:sqlite");

let sqliteModulePromise: Promise<SqliteModule> | null = null;

function quotePostgresIdent(value: string): string {
  return `"${value.replaceAll("\"", "\"\"")}"`;
}

function quotePostgresLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

async function loadSqliteModule(): Promise<SqliteModule> {
  if (!sqliteModulePromise) {
    const originalEmitWarning = process.emitWarning.bind(process);
    process.emitWarning = ((warning: string | Error, ...args: unknown[]) => {
      if (typeof warning === "string" && warning.includes("SQLite is an experimental feature")) {
        return;
      }
      if (warning instanceof Error && warning.name === "ExperimentalWarning" && warning.message.includes("SQLite")) {
        return;
      }
      return originalEmitWarning(warning as never, ...(args as []));
    }) as typeof process.emitWarning;

    sqliteModulePromise = import("node:sqlite").finally(() => {
      process.emitWarning = originalEmitWarning;
    });
  }
  return sqliteModulePromise;
}

async function queryExistingSqliteRoots(file: string, roots: readonly string[]): Promise<Set<string>> {
  if (roots.length === 0) return new Set();
  const { DatabaseSync } = await loadSqliteModule();
  const db = new DatabaseSync(file);
  try {
    const placeholders = roots.map(() => "?").join(", ");
    const rows = db
      .prepare(`SELECT root FROM roots WHERE root IN (${placeholders})`)
      .all(...roots) as Array<{ root: string }>;
    return new Set(rows.map((row: { root: string }) => row.root));
  } catch (error) {
    throw new Error(
      `Failed to query sqlite roots. Initialize the graph first with \`fide graph connect --graph-key ... --initialize\`. ${error instanceof Error ? error.message : String(error)}`,
    );
  } finally {
    db.close();
  }
}

async function queryExistingPostgresRoots(
  databaseUrl: string,
  schema: string,
  roots: readonly string[],
): Promise<Set<string>> {
  if (roots.length === 0) return new Set();
  const client = createPgClient(databaseUrl, { suppressNotices: true });
  try {
    const inList = roots.map((root) => quotePostgresLiteral(root)).join(", ");
    const rows = await client.unsafe<Array<{ root: string }>>(
      `SELECT root FROM ${quotePostgresIdent(schema)}.${quotePostgresIdent("roots")} WHERE root IN (${inList});`,
    );
    return new Set(rows.map((row) => row.root));
  } catch (error) {
    throw new Error(
      `Failed to query postgres roots in schema "${schema}". Initialize the graph first with \`fide graph connect --graph-key ... --initialize\`. ${error instanceof Error ? error.message : String(error)}`,
    );
  } finally {
    await client.end({ timeout: 1 });
  }
}

export async function queryExistingRoots(
  target: StoreTarget,
  roots: readonly string[],
): Promise<Set<string>> {
  if (target.type === "sqlite") {
    return queryExistingSqliteRoots(target.file, roots);
  }
  if (!target.databaseUrl) {
    throw new Error("Missing postgres database URL while querying graph roots. Configure connection.url in .fide/graphs/<graph-key>/config.json or set the referenced env var.");
  }
  return queryExistingPostgresRoots(target.databaseUrl, target.schema, roots);
}
