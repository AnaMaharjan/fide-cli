type SqliteModule = typeof import("node:sqlite");

type SqliteQueryResult = {
  rows: unknown[];
};

export type SqliteInspection = {
  reachable: boolean;
  initialized: boolean;
  missing: string[];
  error?: string;
};

const EXPECTED_REFERENCE_IDENTIFIER_COLUMNS = [
  "identifier_fingerprint",
  "reference_identifier",
];

const EXPECTED_STATEMENTS_COLUMNS = [
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

const EXPECTED_ROOTS_COLUMNS = [
  "root",
  "created_at",
];

const EXPECTED_STATEMENT_ROOTS_COLUMNS = [
  "root",
  "statement_fingerprint",
];

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

export async function inspectSqliteGraph(file: string): Promise<SqliteInspection> {
  const { DatabaseSync } = await loadSqliteModule();
  const db = new DatabaseSync(file);
  try {
    const tableRows = db.prepare(`
      SELECT name, sql
      FROM sqlite_master
      WHERE type = 'table'
        AND (name = 'reference_identifiers' OR name = 'statements' OR name = 'roots' OR name = 'statement_roots')
      ORDER BY name
    `).all() as Array<{ name: string; sql: string | null }>;
    const tableNames = new Set(tableRows.map((row) => row.name));
    const statementsSql = tableRows.find((row) => row.name === "statements")?.sql ?? "";

    const referenceIdentifierColumns = tableNames.has("reference_identifiers")
      ? (db.prepare("PRAGMA table_info(reference_identifiers)").all() as Array<{ name: string }>).map((row) => row.name)
      : [];
    const statementsColumns = tableNames.has("statements")
      ? (db.prepare("PRAGMA table_info(statements)").all() as Array<{ name: string }>).map((row) => row.name)
      : [];
    const rootsColumns = tableNames.has("roots")
      ? (db.prepare("PRAGMA table_info(roots)").all() as Array<{ name: string }>).map((row) => row.name)
      : [];
    const statementRootsColumns = tableNames.has("statement_roots")
      ? (db.prepare("PRAGMA table_info(statement_roots)").all() as Array<{ name: string }>).map((row) => row.name)
      : [];

    const missing: string[] = [];
    if (!tableNames.has("reference_identifiers")) missing.push("sqlite.reference_identifiers");
    if (!tableNames.has("statements")) missing.push("sqlite.statements");
    if (!tableNames.has("roots")) missing.push("sqlite.roots");
    if (!tableNames.has("statement_roots")) missing.push("sqlite.statement_roots");
    missing.push(
      ...EXPECTED_REFERENCE_IDENTIFIER_COLUMNS
        .filter((column) => !referenceIdentifierColumns.includes(column))
        .map((column) => `sqlite.reference_identifiers.${column}`),
    );
    missing.push(
      ...EXPECTED_STATEMENTS_COLUMNS
        .filter((column) => !statementsColumns.includes(column))
        .map((column) => `sqlite.statements.${column}`),
    );
    missing.push(
      ...EXPECTED_ROOTS_COLUMNS
        .filter((column) => !rootsColumns.includes(column))
        .map((column) => `sqlite.roots.${column}`),
    );
    missing.push(
      ...EXPECTED_STATEMENT_ROOTS_COLUMNS
        .filter((column) => !statementRootsColumns.includes(column))
        .map((column) => `sqlite.statement_roots.${column}`),
    );
    if (!statementsSql.includes("chk_subject_protocol_self_sourced")) {
      missing.push("sqlite.statements.chk_subject_protocol_self_sourced");
    }
    if (!statementsSql.includes("chk_object_protocol_self_sourced")) {
      missing.push("sqlite.statements.chk_object_protocol_self_sourced");
    }

    return {
      reachable: true,
      initialized: missing.length === 0,
      missing,
    };
  } catch (error) {
    return {
      reachable: false,
      initialized: false,
      missing: [file],
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    db.close();
  }
}
