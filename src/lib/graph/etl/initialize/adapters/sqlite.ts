import { FIDE_ENTITY_TYPES } from "@chris-test/graph";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import {
  createStatementGraphStorageSchema,
  type CreateStatementGraphStorageSchemaOptions,
  type GraphStorageSchema,
} from "../createStatementGraphStorageSchema.js";

export type SqliteGraphStorageAdapter = {
  type: "sqlite";
  file: string;
  storageSchema: GraphStorageSchema;
  createStatements: string[];
};

type CreateSqliteGraphStorageAdapterOptions = {
  file: string;
  storage?: CreateStatementGraphStorageSchemaOptions;
};

type SqliteModule = typeof import("node:sqlite");

function quoteIdent(value: string): string {
  return `"${value.replaceAll("\"", "\"\"")}"`;
}

const SQLITE_ENTITY_TYPE_VALUES = Array.from(
  new Set(Object.values(FIDE_ENTITY_TYPES).map((spec) => spec.code)),
).sort();

function sqliteInList(values: readonly string[]): string {
  return values.map((value) => `'${value.replaceAll("'", "''")}'`).join(", ");
}

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

export function createSqliteGraphStorageAdapter(
  options: CreateSqliteGraphStorageAdapterOptions,
): SqliteGraphStorageAdapter {
  const storageSchema = createStatementGraphStorageSchema(options.storage);
  const { referenceIdentifiers, statements, roots, statementRoots } = storageSchema.tables;

  const createStatements = [
    `CREATE TABLE IF NOT EXISTS ${quoteIdent(referenceIdentifiers.name)} (
  ${quoteIdent(referenceIdentifiers.columns.identifierFingerprint.name)} TEXT PRIMARY KEY,
  ${quoteIdent(referenceIdentifiers.columns.referenceIdentifier.name)} TEXT NOT NULL
);`,
    `CREATE TABLE IF NOT EXISTS ${quoteIdent(statements.name)} (
  ${quoteIdent(statements.columns.statementFingerprint.name)} TEXT PRIMARY KEY,
  ${quoteIdent(statements.columns.subjectType.name)} TEXT NOT NULL CHECK (${quoteIdent(statements.columns.subjectType.name)} IN (${sqliteInList(SQLITE_ENTITY_TYPE_VALUES)})),
  ${quoteIdent(statements.columns.subjectReferenceType.name)} TEXT NOT NULL CHECK (${quoteIdent(statements.columns.subjectReferenceType.name)} IN (${sqliteInList(SQLITE_ENTITY_TYPE_VALUES)})),
  ${quoteIdent(statements.columns.subjectFingerprint.name)} TEXT NOT NULL,
  ${quoteIdent(statements.columns.predicateFingerprint.name)} TEXT NOT NULL,
  ${quoteIdent(statements.columns.objectType.name)} TEXT NOT NULL CHECK (${quoteIdent(statements.columns.objectType.name)} IN (${sqliteInList(SQLITE_ENTITY_TYPE_VALUES)})),
  ${quoteIdent(statements.columns.objectReferenceType.name)} TEXT NOT NULL CHECK (${quoteIdent(statements.columns.objectReferenceType.name)} IN (${sqliteInList(SQLITE_ENTITY_TYPE_VALUES)})),
  ${quoteIdent(statements.columns.objectFingerprint.name)} TEXT NOT NULL,
  ${quoteIdent(statements.columns.createdAt.name)} TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT ${quoteIdent("chk_subject_protocol_self_sourced")} CHECK (
    (${quoteIdent(statements.columns.subjectType.name)} = '00' AND ${quoteIdent(statements.columns.subjectReferenceType.name)} = '00') OR
    (${quoteIdent(statements.columns.subjectType.name)} <> '00' AND ${quoteIdent(statements.columns.subjectReferenceType.name)} <> '00')
  ),
  CONSTRAINT ${quoteIdent("chk_object_protocol_self_sourced")} CHECK (
    (${quoteIdent(statements.columns.objectType.name)} = '00' AND ${quoteIdent(statements.columns.objectReferenceType.name)} = '00') OR
    (${quoteIdent(statements.columns.objectType.name)} <> '00' AND ${quoteIdent(statements.columns.objectReferenceType.name)} <> '00')
  )
);`,
  ];

  if (!roots.optional) {
    createStatements.push(`CREATE TABLE IF NOT EXISTS ${quoteIdent(roots.name)} (
  ${quoteIdent(roots.columns.root.name)} TEXT PRIMARY KEY,
  ${quoteIdent(roots.columns.createdAt.name)} TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);`);
  }

  if (!statementRoots.optional) {
    createStatements.push(`CREATE TABLE IF NOT EXISTS ${quoteIdent(statementRoots.name)} (
  ${quoteIdent(statementRoots.columns.root.name)} TEXT NOT NULL,
  ${quoteIdent(statementRoots.columns.statementFingerprint.name)} TEXT NOT NULL,
  PRIMARY KEY (${quoteIdent(statementRoots.columns.root.name)}, ${quoteIdent(statementRoots.columns.statementFingerprint.name)})
);`);
  }

  return {
    type: "sqlite",
    file: options.file,
    storageSchema,
    createStatements,
  };
}

export async function initializeSqliteGraphStorage(
  options: CreateSqliteGraphStorageAdapterOptions,
): Promise<SqliteGraphStorageAdapter> {
  const adapter = createSqliteGraphStorageAdapter(options);
  await mkdir(dirname(adapter.file), { recursive: true });
  const { DatabaseSync } = await loadSqliteModule();
  const db = new DatabaseSync(adapter.file);
  try {
    for (const statement of adapter.createStatements) {
      db.exec(statement);
    }
  } finally {
    db.close();
  }
  return adapter;
}
