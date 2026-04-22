import {
  createStatementGraphStorageSchema,
} from "../../initialize/createStatementGraphStorageSchema.js";
import type { GraphStatementBatchRows } from "../../transform/statementBatchToGraphRows.js";
import { FIDE_ENTITY_TYPES } from "@chris-test/graph";

type SqliteModule = typeof import("node:sqlite");

let sqliteModulePromise: Promise<SqliteModule> | null = null;
const SQLITE_ENTITY_TYPE_VALUES: ReadonlySet<string> = new Set(
  Object.values(FIDE_ENTITY_TYPES).map((spec) => spec.code),
);

function createLoadDiagnosticError(
  message: string,
  details: Record<string, unknown>,
  cause?: unknown,
): Error & { details: Record<string, unknown>; cause?: unknown } {
  const error = new Error(message) as Error & { details: Record<string, unknown>; cause?: unknown };
  error.details = details;
  if (cause !== undefined) {
    error.cause = cause;
  }
  return error;
}

function validateStatementRow(batchRoot: string, rowIndex: number, row: GraphStatementBatchRows["statements"][number]): void {
  const pairs = [
    ["subjectType", row.subjectType],
    ["subjectReferenceType", row.subjectReferenceType],
    ["objectType", row.objectType],
    ["objectReferenceType", row.objectReferenceType],
  ] as const;
  for (const [field, value] of pairs) {
    if (!SQLITE_ENTITY_TYPE_VALUES.has(value)) {
      throw createLoadDiagnosticError(
        `Invalid statement row before sqlite load: ${field} ${JSON.stringify(value)} is not an allowed FIDE entity type code.`,
        {
          batchRoot,
          table: "statements",
          rowIndex,
          field,
          allowedEntityTypeCodes: Array.from(SQLITE_ENTITY_TYPE_VALUES).sort(),
          statementRow: row,
          statementDebug: row.debug,
        },
      );
    }
  }
  const subjectSelfSourced = row.subjectType === "00";
  if (subjectSelfSourced !== (row.subjectReferenceType === "00")) {
    throw createLoadDiagnosticError(
      "Invalid statement row before sqlite load: subject_type and subject_reference_type must both be '00' or both be non-'00'.",
      {
        batchRoot,
        table: "statements",
        rowIndex,
        statementRow: row,
        statementDebug: row.debug,
      },
    );
  }
  const objectSelfSourced = row.objectType === "00";
  if (objectSelfSourced !== (row.objectReferenceType === "00")) {
    throw createLoadDiagnosticError(
      "Invalid statement row before sqlite load: object_type and object_reference_type must both be '00' or both be non-'00'.",
      {
        batchRoot,
        table: "statements",
        rowIndex,
        statementRow: row,
        statementDebug: row.debug,
      },
    );
  }
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

export async function loadStatementBatchToSqlite(
  file: string,
  rows: GraphStatementBatchRows,
): Promise<{ insertedRoot: boolean; statementCount: number }> {
  const { DatabaseSync } = await loadSqliteModule();
  const db = new DatabaseSync(file);
  const schema = createStatementGraphStorageSchema();
  const { referenceIdentifiers, statements, roots, statementRoots } = schema.tables;

  try {
    const insertRoot = db.prepare(`
      INSERT OR IGNORE INTO ${roots.name} (
        ${roots.columns.root.name},
        ${roots.columns.title.name},
        ${roots.columns.description.name}
      )
      VALUES (?, ?, ?)
    `);
    const insertReferenceIdentifier = db.prepare(`
      INSERT INTO ${referenceIdentifiers.name} (
        ${referenceIdentifiers.columns.identifierFingerprint.name},
        ${referenceIdentifiers.columns.referenceIdentifier.name}
      ) VALUES (?, ?)
      ON CONFLICT(${referenceIdentifiers.columns.identifierFingerprint.name}) DO NOTHING
    `);
    const insertStatement = db.prepare(`
      INSERT INTO ${statements.name} (
        ${statements.columns.statementFingerprint.name},
        ${statements.columns.subjectType.name},
        ${statements.columns.subjectReferenceType.name},
        ${statements.columns.subjectFingerprint.name},
        ${statements.columns.propertyFingerprint.name},
        ${statements.columns.objectType.name},
        ${statements.columns.objectReferenceType.name},
        ${statements.columns.objectFingerprint.name}
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(${statements.columns.statementFingerprint.name}) DO NOTHING
    `);
    const insertStatementRoot = db.prepare(`
      INSERT INTO ${statementRoots.name} (
        ${statementRoots.columns.root.name},
        ${statementRoots.columns.statementFingerprint.name}
      ) VALUES (?, ?)
      ON CONFLICT(${statementRoots.columns.root.name}, ${statementRoots.columns.statementFingerprint.name}) DO NOTHING
    `);

    db.exec("BEGIN");
    try {
      const rootInsertResult = insertRoot.run(
        rows.root.root,
        rows.root.title ?? null,
        rows.root.description ?? null,
      ) as { changes?: number };
      const insertedRoot = (rootInsertResult.changes ?? 0) > 0;
      if (!insertedRoot) {
        db.exec("COMMIT");
        return { insertedRoot: false, statementCount: 0 };
      }

      for (const row of rows.referenceIdentifiers) {
        try {
          insertReferenceIdentifier.run(row.identifierFingerprint, row.referenceIdentifier);
        } catch (error) {
          throw createLoadDiagnosticError(
            "Failed inserting reference identifier row during sqlite load.",
            {
              batchRoot: rows.root.root,
              table: "reference_identifiers",
              row,
            },
            error,
          );
        }
      }
      for (const [rowIndex, row] of rows.statements.entries()) {
        validateStatementRow(rows.root.root, rowIndex, row);
        try {
          insertStatement.run(
            row.statementFingerprint,
            row.subjectType,
            row.subjectReferenceType,
            row.subjectFingerprint,
            row.propertyFingerprint,
            row.objectType,
            row.objectReferenceType,
            row.objectFingerprint,
          );
        } catch (error) {
          throw createLoadDiagnosticError(
            "Failed inserting statement row during sqlite load.",
            {
              batchRoot: rows.root.root,
              table: "statements",
              rowIndex,
              statementRow: row,
              statementDebug: row.debug,
            },
            error,
          );
        }
      }
      for (const row of rows.statementRoots) {
        try {
          insertStatementRoot.run(row.root, row.statementFingerprint);
        } catch (error) {
          throw createLoadDiagnosticError(
            "Failed inserting statement-root row during sqlite load.",
            {
              batchRoot: rows.root.root,
              table: "statement_roots",
              row,
            },
            error,
          );
        }
      }
      db.exec("COMMIT");
      return { insertedRoot: true, statementCount: rows.statements.length };
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  } finally {
    db.close();
  }
}

export async function updateStatementBatchRootMetadataInSqlite(
  file: string,
  input: { root: string; title?: string; description?: string },
): Promise<void> {
  const { DatabaseSync } = await loadSqliteModule();
  const db = new DatabaseSync(file);
  const schema = createStatementGraphStorageSchema();
  const { roots } = schema.tables;

  try {
    const updateRoot = db.prepare(`
      UPDATE ${roots.name}
      SET
        ${roots.columns.title.name} = ?,
        ${roots.columns.description.name} = ?
      WHERE ${roots.columns.root.name} = ?
    `);
    updateRoot.run(input.title ?? null, input.description ?? null, input.root);
  } finally {
    db.close();
  }
}

/** Remove one loaded batch: statement root links, root row, then statements only referenced by that batch. */
export async function deleteStatementBatchByRootFromSqlite(file: string, root: string): Promise<void> {
  const { DatabaseSync } = await loadSqliteModule();
  const db = new DatabaseSync(file);
  const schema = createStatementGraphStorageSchema();
  const { statements, roots, statementRoots } = schema.tables;
  const tblSr = statementRoots.name;
  const tblRoots = roots.name;
  const tblSt = statements.name;
  const colRoot = statementRoots.columns.root.name;
  const colFp = statementRoots.columns.statementFingerprint.name;
  const stFp = statements.columns.statementFingerprint.name;
  const rootsPk = roots.columns.root.name;

  try {
    db.exec("BEGIN");
    try {
      const selectFps = db.prepare(`SELECT DISTINCT ${colFp} FROM ${tblSr} WHERE ${colRoot} = ?`);
      const fpsRows = selectFps.all(root) as Array<Record<string, string>>;
      const deleteSr = db.prepare(`DELETE FROM ${tblSr} WHERE ${colRoot} = ?`);
      deleteSr.run(root);
      const deleteRoot = db.prepare(`DELETE FROM ${tblRoots} WHERE ${rootsPk} = ?`);
      deleteRoot.run(root);
      const countSrForFp = db.prepare(`SELECT COUNT(*) AS c FROM ${tblSr} WHERE ${colFp} = ?`);
      const deleteSt = db.prepare(`DELETE FROM ${tblSt} WHERE ${stFp} = ?`);
      for (const row of fpsRows) {
        const fp = row[colFp];
        if (typeof fp !== "string") continue;
        const cntRows = countSrForFp.all(fp) as Array<{ c: number }>;
        const cnt = cntRows[0]?.c ?? 0;
        if (cnt === 0) {
          deleteSt.run(fp);
        }
      }
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  } finally {
    db.close();
  }
}
