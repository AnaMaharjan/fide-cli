import { existsSync } from "node:fs";
import { parseFideId } from "@chris-test/graph";

type SqliteModule = typeof import("node:sqlite");

type GraphStatement = {
  statementFideId?: `did:fide:0x${string}`;
  subjectFideId: `did:fide:0x${string}`;
  subjectReferenceIdentifier: string;
  predicateFideId: `did:fide:0x${string}`;
  predicateReferenceIdentifier: string;
  objectFideId: `did:fide:0x${string}`;
  objectReferenceIdentifier: string;
};

type SqliteInspection = {
  reachable: boolean;
  initialized: boolean;
  missing: string[];
  error?: string;
};

type SqliteQueryResult = {
  rows: unknown[];
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

let sqliteModulePromise: Promise<SqliteModule> | null = null;

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

export async function executeSqliteQuery(file: string, sql: string, options?: { allowWrite?: boolean }): Promise<SqliteQueryResult> {
  const { DatabaseSync } = await loadSqliteModule();
  const db = new DatabaseSync(file);
  try {
    if (options?.allowWrite) {
      db.exec(sql);
      return { rows: [] };
    }
    return {
      rows: db.prepare(sql).all() as unknown[],
    };
  } finally {
    db.close();
  }
}

export async function ensureSqliteGraphSchema(file: string, options?: { drop?: boolean }): Promise<void> {
  const { DatabaseSync } = await loadSqliteModule();
  const db = new DatabaseSync(file);
  try {
    if (options?.drop) {
      db.exec(`
        DROP TABLE IF EXISTS statements;
        DROP TABLE IF EXISTS reference_identifiers;
      `);
    }

    db.exec(`
      CREATE TABLE IF NOT EXISTS reference_identifiers (
        identifier_fingerprint TEXT PRIMARY KEY,
        reference_identifier TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS statements (
        statement_fingerprint TEXT PRIMARY KEY,
        subject_type TEXT NOT NULL,
        subject_reference_type TEXT NOT NULL,
        subject_fingerprint TEXT NOT NULL,
        predicate_fingerprint TEXT NOT NULL,
        object_type TEXT NOT NULL,
        object_reference_type TEXT NOT NULL,
        object_fingerprint TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
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
  } finally {
    db.close();
  }
}

export async function inspectSqliteGraph(file: string): Promise<SqliteInspection> {
  if (!existsSync(file)) {
    return {
      reachable: false,
      initialized: false,
      missing: [file],
    };
  }

  const { DatabaseSync } = await loadSqliteModule();
  const db = new DatabaseSync(file);
  try {
    const tableRows = db.prepare(`
      SELECT name, sql
      FROM sqlite_master
      WHERE type = 'table'
        AND (name = 'reference_identifiers' OR name = 'statements')
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

    const missing: string[] = [];
    if (!tableNames.has("reference_identifiers")) {
      missing.push("sqlite.reference_identifiers");
    }
    if (!tableNames.has("statements")) {
      missing.push("sqlite.statements");
    }
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

export async function ingestStatementsToSqlite(file: string, statements: GraphStatement[]): Promise<number> {
  const { DatabaseSync } = await loadSqliteModule();
  const db = new DatabaseSync(file);
  try {
    const upsertReferenceIdentifier = db.prepare(`
      INSERT INTO reference_identifiers (identifier_fingerprint, reference_identifier)
      VALUES (?, ?)
      ON CONFLICT(identifier_fingerprint)
      DO UPDATE SET reference_identifier = excluded.reference_identifier
    `);
    const insertStatement = db.prepare(`
      INSERT INTO statements (
        statement_fingerprint,
        subject_type,
        subject_reference_type,
        subject_fingerprint,
        predicate_fingerprint,
        object_type,
        object_reference_type,
        object_fingerprint
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(statement_fingerprint) DO NOTHING
    `);

    db.exec("BEGIN");
    try {
      for (const statement of statements) {
        if (!statement.statementFideId) {
          throw new Error("Invalid statement: missing statementFideId.");
        }
        const subject = parseFideId(statement.subjectFideId);
        const predicate = parseFideId(statement.predicateFideId);
        const object = parseFideId(statement.objectFideId);
        const statementId = parseFideId(statement.statementFideId);

        upsertReferenceIdentifier.run(subject.fingerprint, statement.subjectReferenceIdentifier);
        upsertReferenceIdentifier.run(predicate.fingerprint, statement.predicateReferenceIdentifier);
        upsertReferenceIdentifier.run(object.fingerprint, statement.objectReferenceIdentifier);

        insertStatement.run(
          statementId.fingerprint,
          subject.typeChar,
          subject.referenceChar,
          subject.fingerprint,
          predicate.fingerprint,
          object.typeChar,
          object.referenceChar,
          object.fingerprint,
        );
      }
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }

    return statements.length;
  } finally {
    db.close();
  }
}
