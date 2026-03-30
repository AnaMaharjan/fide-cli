type SqliteModule = typeof import("node:sqlite");

type SqliteQueryResult = {
  rows: unknown[];
};

type SqliteColumnType = "INTEGER" | "REAL" | "TEXT" | "BLOB";

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

function quoteIdent(value: string): string {
  return `"${value.replaceAll("\"", "\"\"")}"`;
}

function inferSqliteColumnType(values: unknown[]): SqliteColumnType {
  let sawReal = false;
  let sawText = false;
  let sawBlob = false;

  for (const value of values) {
    if (value === null || value === undefined) continue;
    if (typeof value === "bigint") continue;
    if (typeof value === "boolean") continue;
    if (typeof value === "number") {
      if (!Number.isInteger(value)) sawReal = true;
      continue;
    }
    if (typeof value === "string") {
      sawText = true;
      continue;
    }
    if (value instanceof Uint8Array) {
      sawBlob = true;
      continue;
    }
    sawText = true;
  }

  if (sawText) return "TEXT";
  if (sawBlob) return "BLOB";
  if (sawReal) return "REAL";
  return "INTEGER";
}

function sqliteCellValue(value: unknown): unknown {
  if (value === undefined) return null;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "bigint") return value.toString();
  if (value === null) return null;
  if (
    typeof value === "string"
    || typeof value === "number"
    || value instanceof Uint8Array
  ) {
    return value;
  }
  return JSON.stringify(value);
}

export async function writeSqliteTableFromRows(
  file: string,
  tableName: string,
  rows: unknown[],
): Promise<{ rowCount: number; tableName: string }> {
  if (rows.length === 0) {
    throw new Error("SQLite output requires at least one row so the table schema can be inferred.");
  }
  if (!rows.every((row) => row && typeof row === "object" && !Array.isArray(row))) {
    throw new Error("SQLite output requires row objects.");
  }

  const objectRows = rows as Array<Record<string, unknown>>;
  const columnNames = Array.from(new Set(objectRows.flatMap((row) => Object.keys(row))));
  if (columnNames.length === 0) {
    throw new Error("SQLite output requires at least one column.");
  }

  const { DatabaseSync } = await loadSqliteModule();
  const db = new DatabaseSync(file);

  try {
    const columnDefinitions = columnNames.map((columnName) => {
      const values = objectRows.map((row) => row[columnName]);
      return `${quoteIdent(columnName)} ${inferSqliteColumnType(values)}`;
    });
    const quotedTableName = quoteIdent(tableName);
    const quotedColumns = columnNames.map((columnName) => quoteIdent(columnName));
    const insertSql = `
      INSERT INTO ${quotedTableName} (${quotedColumns.join(", ")})
      VALUES (${columnNames.map(() => "?").join(", ")})
    `;

    db.exec("BEGIN");
    try {
      db.exec(`DROP TABLE IF EXISTS ${quotedTableName}`);
      db.exec(`CREATE TABLE ${quotedTableName} (${columnDefinitions.join(", ")})`);
      const insert = db.prepare(insertSql);
      for (const row of objectRows) {
        insert.run(...columnNames.map((columnName) => sqliteCellValue(row[columnName])));
      }
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }

    return { rowCount: objectRows.length, tableName };
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
