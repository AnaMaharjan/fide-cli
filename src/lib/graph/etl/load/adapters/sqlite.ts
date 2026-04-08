import {
  createStatementGraphStorageSchema,
} from "../../initialize/createStatementGraphStorageSchema.js";
import type { GraphStatementBatchRows } from "../../transform/statementBatchToGraphRows.js";

type SqliteModule = typeof import("node:sqlite");

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
      INSERT OR IGNORE INTO ${roots.name} (${roots.columns.root.name})
      VALUES (?)
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
        ${statements.columns.predicateFingerprint.name},
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
      const rootInsertResult = insertRoot.run(rows.root.root) as { changes?: number };
      const insertedRoot = (rootInsertResult.changes ?? 0) > 0;
      if (!insertedRoot) {
        db.exec("COMMIT");
        return { insertedRoot: false, statementCount: 0 };
      }

      for (const row of rows.referenceIdentifiers) {
        insertReferenceIdentifier.run(row.identifierFingerprint, row.referenceIdentifier);
      }
      for (const row of rows.statements) {
        insertStatement.run(
          row.statementFingerprint,
          row.subjectType,
          row.subjectReferenceType,
          row.subjectFingerprint,
          row.predicateFingerprint,
          row.objectType,
          row.objectReferenceType,
          row.objectFingerprint,
        );
      }
      for (const row of rows.statementRoots) {
        insertStatementRoot.run(row.root, row.statementFingerprint);
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
