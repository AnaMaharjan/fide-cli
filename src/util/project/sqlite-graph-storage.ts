type SqliteModule = typeof import("node:sqlite");

type SqliteQueryResult = {
  rows: unknown[];
};

let sqliteModulePromise: Promise<SqliteModule> | null = null;

function isReadOnlySql(sql: string): boolean {
  const normalized = sql
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--.*$/gm, " ")
    .trim()
    .toLowerCase();
  if (normalized.length === 0) return true;
  return /^(select|with|pragma\s+table_info|pragma\s+index_list|pragma\s+index_info|explain|values)\b/.test(normalized);
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

export async function executeSqliteQuery(file: string, sql: string): Promise<SqliteQueryResult> {
  const { DatabaseSync } = await loadSqliteModule();
  const db = new DatabaseSync(file);
  try {
    if (isReadOnlySql(sql)) {
      return {
        rows: db.prepare(sql).all() as unknown[],
      };
    }
    db.exec(sql);
    return { rows: [] };
  } finally {
    db.close();
  }
}
