export type GraphStorageColumnSchema = {
  name: string;
  description: string;
  columnNotes?: string[];
};

export type GraphStorageTableSchema = {
  name: string;
  description: string;
  optional?: boolean;
  columnNotes?: string[];
  columns: Record<string, GraphStorageColumnSchema>;
};

export type GraphStorageSchema = {
  tables: {
    referenceIdentifiers: GraphStorageTableSchema;
    statements: GraphStorageTableSchema;
    roots: GraphStorageTableSchema;
    statementRoots: GraphStorageTableSchema;
  };
};

export type GraphStorageColumnOverride = {
  name?: string;
  description?: string;
  columnNotes?: string[];
};

export type GraphStorageTableOverride = {
  name?: string;
  description?: string;
  optional?: boolean;
  columnNotes?: string[];
  columns?: Record<string, GraphStorageColumnOverride>;
};

export type CreateStatementGraphStorageSchemaOptions = {
  tables?: Partial<{
    referenceIdentifiers: GraphStorageTableOverride;
    statements: GraphStorageTableOverride;
    roots: GraphStorageTableOverride;
    statementRoots: GraphStorageTableOverride;
  }>;
};

function mergeTableSchema(
  base: GraphStorageTableSchema,
  override?: GraphStorageTableOverride,
): GraphStorageTableSchema {
  if (!override) return base;

  const mergedColumns = Object.fromEntries(
    Object.entries(base.columns).map(([key, column]) => [
      key,
      {
        name: override.columns?.[key]?.name ?? column.name,
        description: override.columns?.[key]?.description ?? column.description,
        columnNotes: override.columns?.[key]?.columnNotes ?? column.columnNotes,
      },
    ]),
  );

  return {
    name: override.name ?? base.name,
    description: override.description ?? base.description,
    optional: override.optional ?? base.optional,
    columnNotes: override.columnNotes ?? base.columnNotes,
    columns: mergedColumns,
  };
}

export function createStatementGraphStorageSchema(
  options: CreateStatementGraphStorageSchemaOptions = {},
): GraphStorageSchema {
  const base: GraphStorageSchema = {
    tables: {
      referenceIdentifiers: {
        name: "reference_identifiers",
        description: "Reference identifier strings keyed by identifier fingerprint.",
        columns: {
          identifierFingerprint: {
            name: "identifier_fingerprint",
            description: "Stable fingerprint for the reference identifier value.",
          },
          referenceIdentifier: {
            name: "reference_identifier",
            description: "Canonical reference identifier string.",
          },
        },
      },
      statements: {
        name: "statements",
        description: "Canonical stored statement rows for a graph backend.",
        columnNotes: [
          "Predicate type and predicate reference type are assumed by canonical statements and are therefore not stored as separate columns.",
        ],
        columns: {
          statementFingerprint: {
            name: "statement_fingerprint",
            description: "Stable fingerprint for the full statement identifier.",
          },
          subjectType: {
            name: "subject_type",
            description: "Fide entity type character for the subject.",
          },
          subjectReferenceType: {
            name: "subject_reference_type",
            description: "Fide reference type character for the subject.",
          },
          subjectFingerprint: {
            name: "subject_fingerprint",
            description: "Fingerprint of the subject reference identifier.",
          },
          predicateFingerprint: {
            name: "predicate_fingerprint",
            description: "Fingerprint of the predicate reference identifier.",
          },
          objectType: {
            name: "object_type",
            description: "Fide entity type character for the object.",
          },
          objectReferenceType: {
            name: "object_reference_type",
            description: "Fide reference type character for the object.",
          },
          objectFingerprint: {
            name: "object_fingerprint",
            description: "Fingerprint of the object reference identifier.",
          },
          createdAt: {
            name: "created_at",
            description: "Storage-layer insertion timestamp for the statement row.",
          },
        },
      },
      roots: {
        name: "roots",
        description: "Batch roots associated with loaded statement sets.",
        columns: {
          root: {
            name: "root",
            description: "Deterministic root identifier for a loaded statement batch.",
          },
          title: {
            name: "title",
            description: "Optional human-readable title for the loaded statement batch.",
          },
          description: {
            name: "description",
            description: "Optional human-readable description for the loaded statement batch.",
          },
          createdAt: {
            name: "created_at",
            description: "Storage-layer insertion timestamp for the root row.",
          },
        },
      },
      statementRoots: {
        name: "statement_roots",
        description: "Association table between statements and batch roots.",
        columns: {
          root: {
            name: "root",
            description: "Root identifier for the associated loaded statement batch.",
          },
          statementFingerprint: {
            name: "statement_fingerprint",
            description: "Statement fingerprint associated with the root.",
          },
        },
      },
    },
  };

  return {
    tables: {
      referenceIdentifiers: mergeTableSchema(base.tables.referenceIdentifiers, options.tables?.referenceIdentifiers),
      statements: mergeTableSchema(base.tables.statements, options.tables?.statements),
      roots: mergeTableSchema(base.tables.roots, options.tables?.roots),
      statementRoots: mergeTableSchema(base.tables.statementRoots, options.tables?.statementRoots),
    },
  };
}
