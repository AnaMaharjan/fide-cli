import { FIDE_ENTITY_TYPES } from "@chris-test/graph";
import {
  createStatementGraphStorageSchema,
  type CreateStatementGraphStorageSchemaOptions,
  type GraphStorageSchema,
} from "../createStatementGraphStorageSchema.js";

export type PostgresGraphStorageAdapter = {
  type: "postgres";
  schemaName: string;
  storageSchema: GraphStorageSchema;
  entityTypeName: string;
  createStatements: string[];
};

type CreatePostgresGraphStorageAdapterOptions = {
  schemaName: string;
  entityTypeName?: string;
  storage?: CreateStatementGraphStorageSchemaOptions;
};

function quoteIdent(value: string): string {
  return `"${value.replaceAll("\"", "\"\"")}"`;
}

function qualifyTable(schemaName: string, tableName: string): string {
  return `${quoteIdent(schemaName)}.${quoteIdent(tableName)}`;
}

function qualifyType(schemaName: string, typeName: string): string {
  return `${quoteIdent(schemaName)}.${quoteIdent(typeName)}`;
}

function quoteSqlLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

const DEFAULT_ENTITY_TYPE_VALUES = Array.from(
  new Set(Object.values(FIDE_ENTITY_TYPES).map((spec) => spec.code)),
).sort();

export function createPostgresGraphStorageAdapter(
  options: CreatePostgresGraphStorageAdapterOptions,
): PostgresGraphStorageAdapter {
  const storageSchema = createStatementGraphStorageSchema(options.storage);
  const { referenceIdentifiers, statements, roots, statementRoots } = storageSchema.tables;
  const entityTypeName = options.entityTypeName ?? "entity_type";
  const qualifiedEntityType = qualifyType(options.schemaName, entityTypeName);

  const createStatements = [
    `CREATE SCHEMA IF NOT EXISTS ${quoteIdent(options.schemaName)};`,
    `DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    INNER JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = ${quoteSqlLiteral(entityTypeName)}
      AND n.nspname = ${quoteSqlLiteral(options.schemaName)}
  ) THEN
    EXECUTE ${quoteSqlLiteral(`CREATE TYPE ${qualifiedEntityType} AS ENUM (${DEFAULT_ENTITY_TYPE_VALUES.map((value) => quoteSqlLiteral(value)).join(", ")});`)};
  END IF;
END
$$;`,
    `CREATE TABLE IF NOT EXISTS ${qualifyTable(options.schemaName, referenceIdentifiers.name)} (
  ${quoteIdent(referenceIdentifiers.columns.identifierFingerprint.name)} CHAR(36) PRIMARY KEY,
  ${quoteIdent(referenceIdentifiers.columns.referenceIdentifier.name)} TEXT NOT NULL
);`,
    `CREATE INDEX IF NOT EXISTS ${quoteIdent(`${referenceIdentifiers.name}_reference_idx`)} ON ${qualifyTable(options.schemaName, referenceIdentifiers.name)} (${quoteIdent(referenceIdentifiers.columns.referenceIdentifier.name)});`,
    `CREATE TABLE IF NOT EXISTS ${qualifyTable(options.schemaName, statements.name)} (
  ${quoteIdent(statements.columns.statementFingerprint.name)} CHAR(36) PRIMARY KEY,
  ${quoteIdent(statements.columns.subjectType.name)} ${qualifiedEntityType} NOT NULL,
  ${quoteIdent(statements.columns.subjectReferenceType.name)} ${qualifiedEntityType} NOT NULL,
  ${quoteIdent(statements.columns.subjectFingerprint.name)} CHAR(36) NOT NULL,
  ${quoteIdent(statements.columns.predicateFingerprint.name)} CHAR(36) NOT NULL,
  ${quoteIdent(statements.columns.objectType.name)} ${qualifiedEntityType} NOT NULL,
  ${quoteIdent(statements.columns.objectReferenceType.name)} ${qualifiedEntityType} NOT NULL,
  ${quoteIdent(statements.columns.objectFingerprint.name)} CHAR(36) NOT NULL,
  ${quoteIdent(statements.columns.createdAt.name)} TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ${quoteIdent("chk_subject_protocol_self_sourced")} CHECK (
    (${quoteIdent(statements.columns.subjectType.name)} = '00' AND ${quoteIdent(statements.columns.subjectReferenceType.name)} = '00') OR
    (${quoteIdent(statements.columns.subjectType.name)} <> '00' AND ${quoteIdent(statements.columns.subjectReferenceType.name)} <> '00')
  ),
  CONSTRAINT ${quoteIdent("chk_object_protocol_self_sourced")} CHECK (
    (${quoteIdent(statements.columns.objectType.name)} = '00' AND ${quoteIdent(statements.columns.objectReferenceType.name)} = '00') OR
    (${quoteIdent(statements.columns.objectType.name)} <> '00' AND ${quoteIdent(statements.columns.objectReferenceType.name)} <> '00')
  ),
  CONSTRAINT ${quoteIdent("fk_statements_subject_fingerprint")} FOREIGN KEY (${quoteIdent(statements.columns.subjectFingerprint.name)})
    REFERENCES ${qualifyTable(options.schemaName, referenceIdentifiers.name)} (${quoteIdent(referenceIdentifiers.columns.identifierFingerprint.name)}),
  CONSTRAINT ${quoteIdent("fk_statements_predicate_fingerprint")} FOREIGN KEY (${quoteIdent(statements.columns.predicateFingerprint.name)})
    REFERENCES ${qualifyTable(options.schemaName, referenceIdentifiers.name)} (${quoteIdent(referenceIdentifiers.columns.identifierFingerprint.name)}),
  CONSTRAINT ${quoteIdent("fk_statements_object_fingerprint")} FOREIGN KEY (${quoteIdent(statements.columns.objectFingerprint.name)})
    REFERENCES ${qualifyTable(options.schemaName, referenceIdentifiers.name)} (${quoteIdent(referenceIdentifiers.columns.identifierFingerprint.name)})
);`,
    `COMMENT ON TABLE ${qualifyTable(options.schemaName, referenceIdentifiers.name)} IS '${referenceIdentifiers.description.replaceAll("'", "''")}';`,
    `COMMENT ON TABLE ${qualifyTable(options.schemaName, statements.name)} IS '${statements.description.replaceAll("'", "''")}';`,
    ...Object.values(statements.columns).map(
      (column) =>
        `COMMENT ON COLUMN ${qualifyTable(options.schemaName, statements.name)}.${quoteIdent(column.name)} IS '${column.description.replaceAll("'", "''")}';`,
    ),
  ];

  if (!roots.optional) {
    createStatements.push(`CREATE TABLE IF NOT EXISTS ${qualifyTable(options.schemaName, roots.name)} (
  ${quoteIdent(roots.columns.root.name)} TEXT PRIMARY KEY,
  ${quoteIdent(roots.columns.createdAt.name)} TIMESTAMPTZ NOT NULL DEFAULT NOW()
);`);
    createStatements.push(
      `COMMENT ON TABLE ${qualifyTable(options.schemaName, roots.name)} IS '${roots.description.replaceAll("'", "''")}';`,
    );
  }

  if (!statementRoots.optional) {
    createStatements.push(`CREATE TABLE IF NOT EXISTS ${qualifyTable(options.schemaName, statementRoots.name)} (
  ${quoteIdent(statementRoots.columns.root.name)} TEXT NOT NULL,
  ${quoteIdent(statementRoots.columns.statementFingerprint.name)} CHAR(36) NOT NULL,
  PRIMARY KEY (${quoteIdent(statementRoots.columns.root.name)}, ${quoteIdent(statementRoots.columns.statementFingerprint.name)}),
  CONSTRAINT ${quoteIdent("fk_statement_roots_root")} FOREIGN KEY (${quoteIdent(statementRoots.columns.root.name)})
    REFERENCES ${qualifyTable(options.schemaName, roots.name)} (${quoteIdent(roots.columns.root.name)}),
  CONSTRAINT ${quoteIdent("fk_statement_roots_statement_fingerprint")} FOREIGN KEY (${quoteIdent(statementRoots.columns.statementFingerprint.name)})
    REFERENCES ${qualifyTable(options.schemaName, statements.name)} (${quoteIdent(statements.columns.statementFingerprint.name)})
);`);
    createStatements.push(
      `COMMENT ON TABLE ${qualifyTable(options.schemaName, statementRoots.name)} IS '${statementRoots.description.replaceAll("'", "''")}';`,
    );
  }

  return {
    type: "postgres",
    schemaName: options.schemaName,
    storageSchema,
    entityTypeName,
    createStatements,
  };
}
