import { createPgClient } from "../../../clients/postgres.js";
import { FIDE_ENTITY_TYPES } from "@chris-test/graph";
import {
  createStatementGraphStorageSchema,
} from "../../initialize/createStatementGraphStorageSchema.js";
import type { GraphStatementBatchRows } from "../../transform/statementBatchToGraphRows.js";

function quoteIdent(value: string): string {
  return `"${value.replaceAll("\"", "\"\"")}"`;
}

function quoteLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function qualify(schema: string, table: string): string {
  return `${quoteIdent(schema)}.${quoteIdent(table)}`;
}

function chunkArray<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

const POSTGRES_ENTITY_TYPE_VALUES: ReadonlySet<string> = new Set(
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
    if (!POSTGRES_ENTITY_TYPE_VALUES.has(value)) {
      throw createLoadDiagnosticError(
        `Invalid statement row before postgres load: ${field} ${JSON.stringify(value)} is not an allowed FIDE entity type code.`,
        {
          batchRoot,
          table: "statements",
          rowIndex,
          field,
          allowedEntityTypeCodes: Array.from(POSTGRES_ENTITY_TYPE_VALUES).sort(),
          statementRow: row,
          statementDebug: row.debug,
        },
      );
    }
  }
  const subjectSelfSourced = row.subjectType === "00";
  if (subjectSelfSourced !== (row.subjectReferenceType === "00")) {
    throw createLoadDiagnosticError(
      "Invalid statement row before postgres load: subject_type and subject_reference_type must both be '00' or both be non-'00'.",
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
      "Invalid statement row before postgres load: object_type and object_reference_type must both be '00' or both be non-'00'.",
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

export async function loadStatementBatchToPostgres(
  input: {
    databaseUrl: string;
    schema: string;
    rows: GraphStatementBatchRows;
  },
): Promise<{ insertedRoot: boolean; statementCount: number }> {
  const client = createPgClient(input.databaseUrl, { suppressNotices: true });
  const storage = createStatementGraphStorageSchema();
  const { referenceIdentifiers, statements, roots, statementRoots } = storage.tables;
  const insertChunkSize = 500;
  const sqlStringOrNull = (value: string | undefined): string =>
    value === undefined ? "NULL" : quoteLiteral(value);

  try {
    return await client.begin(async (tx) => {
      const insertedRoots = await tx.unsafe<Array<{ root: string }>>(
        `INSERT INTO ${qualify(input.schema, roots.name)} (
           ${quoteIdent(roots.columns.root.name)},
           ${quoteIdent(roots.columns.title.name)},
           ${quoteIdent(roots.columns.description.name)}
         )
         VALUES (
           ${quoteLiteral(input.rows.root.root)},
           ${sqlStringOrNull(input.rows.root.title)},
           ${sqlStringOrNull(input.rows.root.description)}
         )
         ON CONFLICT (${quoteIdent(roots.columns.root.name)}) DO NOTHING
         RETURNING ${quoteIdent(roots.columns.root.name)};`,
      );
      if (insertedRoots.length === 0) {
        return { insertedRoot: false, statementCount: 0 };
      }

      for (const chunk of chunkArray(input.rows.referenceIdentifiers, insertChunkSize)) {
        const values = chunk
          .map((row) => `(${quoteLiteral(row.identifierFingerprint)}, ${quoteLiteral(row.referenceIdentifier)})`)
          .join(",\n");
        await tx.unsafe(
          `INSERT INTO ${qualify(input.schema, referenceIdentifiers.name)} (
             ${quoteIdent(referenceIdentifiers.columns.identifierFingerprint.name)},
             ${quoteIdent(referenceIdentifiers.columns.referenceIdentifier.name)}
           ) VALUES ${values}
           ON CONFLICT (${quoteIdent(referenceIdentifiers.columns.identifierFingerprint.name)}) DO NOTHING;`,
        );
      }

      for (const chunk of chunkArray(input.rows.statements, insertChunkSize)) {
        const firstChunkIndex = input.rows.statements.indexOf(chunk[0]!);
        chunk.forEach((row, offset) => validateStatementRow(input.rows.root.root, firstChunkIndex + offset, row));
        const values = chunk
          .map((row) =>
            `(
              ${quoteLiteral(row.statementFingerprint)},
              ${quoteLiteral(row.subjectType)},
              ${quoteLiteral(row.subjectReferenceType)},
              ${quoteLiteral(row.subjectFingerprint)},
              ${quoteLiteral(row.predicateFingerprint)},
              ${quoteLiteral(row.objectType)},
              ${quoteLiteral(row.objectReferenceType)},
              ${quoteLiteral(row.objectFingerprint)}
            )`.replace(/\s+/g, " ").trim(),
          )
          .join(",\n");
        try {
          await tx.unsafe(
            `INSERT INTO ${qualify(input.schema, statements.name)} (
               ${quoteIdent(statements.columns.statementFingerprint.name)},
               ${quoteIdent(statements.columns.subjectType.name)},
               ${quoteIdent(statements.columns.subjectReferenceType.name)},
               ${quoteIdent(statements.columns.subjectFingerprint.name)},
               ${quoteIdent(statements.columns.predicateFingerprint.name)},
               ${quoteIdent(statements.columns.objectType.name)},
               ${quoteIdent(statements.columns.objectReferenceType.name)},
               ${quoteIdent(statements.columns.objectFingerprint.name)}
             ) VALUES ${values}
             ON CONFLICT (${quoteIdent(statements.columns.statementFingerprint.name)}) DO NOTHING;`,
          );
        } catch (error) {
          throw createLoadDiagnosticError(
            "Failed inserting statement chunk during postgres load.",
            {
              batchRoot: input.rows.root.root,
              table: "statements",
              chunkStartIndex: firstChunkIndex,
              chunkSize: chunk.length,
              firstStatementDebug: chunk[0]?.debug,
              lastStatementDebug: chunk[chunk.length - 1]?.debug,
            },
            error,
          );
        }
      }

      for (const chunk of chunkArray(input.rows.statementRoots, insertChunkSize)) {
        const values = chunk
          .map((row) => `(${quoteLiteral(row.root)}, ${quoteLiteral(row.statementFingerprint)})`)
          .join(",\n");
        await tx.unsafe(
          `INSERT INTO ${qualify(input.schema, statementRoots.name)} (
             ${quoteIdent(statementRoots.columns.root.name)},
             ${quoteIdent(statementRoots.columns.statementFingerprint.name)}
           ) VALUES ${values}
           ON CONFLICT (
             ${quoteIdent(statementRoots.columns.root.name)},
             ${quoteIdent(statementRoots.columns.statementFingerprint.name)}
           ) DO NOTHING;`,
        );
      }

      return { insertedRoot: true, statementCount: input.rows.statements.length };
    });
  } finally {
    await client.end({ timeout: 1 });
  }
}

export async function updateStatementBatchRootMetadataInPostgres(input: {
  databaseUrl: string;
  schema: string;
  root: string;
  title?: string;
  description?: string;
}): Promise<void> {
  const client = createPgClient(input.databaseUrl, { suppressNotices: true });
  const storage = createStatementGraphStorageSchema();
  const { roots } = storage.tables;
  const sqlStringOrNull = (value: string | undefined): string =>
    value === undefined ? "NULL" : quoteLiteral(value);

  try {
    await client.unsafe(
      `UPDATE ${qualify(input.schema, roots.name)}
       SET
         ${quoteIdent(roots.columns.title.name)} = ${sqlStringOrNull(input.title)},
         ${quoteIdent(roots.columns.description.name)} = ${sqlStringOrNull(input.description)}
       WHERE ${quoteIdent(roots.columns.root.name)} = ${quoteLiteral(input.root)};`,
    );
  } finally {
    await client.end({ timeout: 1 });
  }
}

/** Remove one loaded batch: statement root links, root row, then statements only referenced by that batch. */
export async function deleteStatementBatchByRootFromPostgres(input: {
  databaseUrl: string;
  schema: string;
  root: string;
}): Promise<void> {
  const client = createPgClient(input.databaseUrl, { suppressNotices: true });
  const storage = createStatementGraphStorageSchema();
  const { statements, roots, statementRoots } = storage.tables;

  const tblSr = qualify(input.schema, statementRoots.name);
  const tblRoots = qualify(input.schema, roots.name);
  const tblSt = qualify(input.schema, statements.name);
  const colRoot = quoteIdent(statementRoots.columns.root.name);
  const colFp = quoteIdent(statementRoots.columns.statementFingerprint.name);
  const stFp = quoteIdent(statements.columns.statementFingerprint.name);
  const rootsPk = quoteIdent(roots.columns.root.name);
  const rootLit = quoteLiteral(input.root);

  try {
    await client.begin(async (tx) => {
      const rows = await tx.unsafe<Array<Record<string, string>>>(
        `SELECT DISTINCT ${colFp} FROM ${tblSr} WHERE ${colRoot} = ${rootLit};`,
      );
      const fps = [
        ...new Set(
          rows
            .map((row) => Object.values(row)[0])
            .filter((v): v is string => typeof v === "string" && v.length > 0),
        ),
      ];

      await tx.unsafe(`DELETE FROM ${tblSr} WHERE ${colRoot} = ${rootLit};`);
      await tx.unsafe(`DELETE FROM ${tblRoots} WHERE ${rootsPk} = ${rootLit};`);

      for (const fp of fps) {
        const fpl = quoteLiteral(fp);
        const cntRows = await tx.unsafe<Array<{ count: string }>>(
          `SELECT COUNT(*)::text AS count FROM ${tblSr} WHERE ${colFp} = ${fpl};`,
        );
        const n = Number(cntRows[0]?.count ?? "0");
        if (n === 0) {
          await tx.unsafe(`DELETE FROM ${tblSt} WHERE ${stFp} = ${fpl};`);
        }
      }
    });
  } finally {
    await client.end({ timeout: 1 });
  }
}
