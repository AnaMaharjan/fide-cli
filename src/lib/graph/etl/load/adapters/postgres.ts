import { createPgClient } from "../../../clients/postgres.js";
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

  try {
    return await client.begin(async (tx) => {
      const insertedRoots = await tx.unsafe<Array<{ root: string }>>(
        `INSERT INTO ${qualify(input.schema, roots.name)} (${quoteIdent(roots.columns.root.name)})
         VALUES (${quoteLiteral(input.rows.root.root)})
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
           ON CONFLICT (${quoteIdent(referenceIdentifiers.columns.identifierFingerprint.name)})
           DO UPDATE SET ${quoteIdent(referenceIdentifiers.columns.referenceIdentifier.name)} = EXCLUDED.${quoteIdent(referenceIdentifiers.columns.referenceIdentifier.name)};`,
        );
      }

      for (const chunk of chunkArray(input.rows.statements, insertChunkSize)) {
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
