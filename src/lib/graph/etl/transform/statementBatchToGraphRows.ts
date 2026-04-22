import { parseFideId, type Statement } from "@chris-test/graph";

type StatementWithPropertyIds = Statement & {
  statementFideId: string;
  propertyFideId: string;
  propertyReferenceIdentifier: string;
};

export type GraphRootRow = {
  root: string;
  title?: string;
  description?: string;
};

export type GraphReferenceIdentifierRow = {
  identifierFingerprint: string;
  referenceIdentifier: string;
};

export type GraphStatementRow = {
  statementFingerprint: string;
  subjectType: string;
  subjectReferenceType: string;
  subjectFingerprint: string;
  propertyFingerprint: string;
  objectType: string;
  objectReferenceType: string;
  objectFingerprint: string;
  debug?: {
    statementIndex: number;
    statementFideId: string;
    subjectFideId: string;
    subjectReferenceIdentifier: string;
    propertyFideId: string;
    propertyReferenceIdentifier: string;
    objectFideId: string;
    objectReferenceIdentifier: string;
  };
};

export type GraphStatementRootRow = {
  root: string;
  statementFingerprint: string;
};

export type GraphStatementBatchRows = {
  root: GraphRootRow;
  referenceIdentifiers: GraphReferenceIdentifierRow[];
  statements: GraphStatementRow[];
  statementRoots: GraphStatementRootRow[];
};

function assertStatementHasId(statement: Statement): asserts statement is StatementWithPropertyIds {
  if (!statement.statementFideId) {
    throw new Error("Invalid statement: missing statementFideId.");
  }
  if (!statement.propertyFideId) {
    throw new Error("Invalid statement: missing propertyFideId.");
  }
  if (!statement.propertyReferenceIdentifier) {
    throw new Error("Invalid statement: missing propertyReferenceIdentifier.");
  }
}

export function transformStatementBatchToGraphRows(
  input: { root: string; title?: string; description?: string; statements: Statement[] },
): GraphStatementBatchRows {
  const referenceIdentifierRows = new Map<string, GraphReferenceIdentifierRow>();
  const statementRows = new Map<string, GraphStatementRow>();
  const statementRootRows = new Map<string, GraphStatementRootRow>();

  for (const [statementIndex, statement] of input.statements.entries()) {
    assertStatementHasId(statement);

    const subject = parseFideId(statement.subjectFideId);
    const property = parseFideId(statement.propertyFideId);
    const object = parseFideId(statement.objectFideId);
    const statementId = parseFideId(statement.statementFideId);

    referenceIdentifierRows.set(subject.fingerprint, {
      identifierFingerprint: subject.fingerprint,
      referenceIdentifier: statement.subjectReferenceIdentifier,
    });
    referenceIdentifierRows.set(property.fingerprint, {
      identifierFingerprint: property.fingerprint,
      referenceIdentifier: statement.propertyReferenceIdentifier,
    });
    referenceIdentifierRows.set(object.fingerprint, {
      identifierFingerprint: object.fingerprint,
      referenceIdentifier: statement.objectReferenceIdentifier,
    });

    statementRows.set(statementId.fingerprint, {
      statementFingerprint: statementId.fingerprint,
      subjectType: subject.typeChar,
      subjectReferenceType: subject.referenceChar,
      subjectFingerprint: subject.fingerprint,
      propertyFingerprint: property.fingerprint,
      objectType: object.typeChar,
      objectReferenceType: object.referenceChar,
      objectFingerprint: object.fingerprint,
      debug: {
        statementIndex,
        statementFideId: statement.statementFideId,
        subjectFideId: statement.subjectFideId,
        subjectReferenceIdentifier: statement.subjectReferenceIdentifier,
        propertyFideId: statement.propertyFideId,
        propertyReferenceIdentifier: statement.propertyReferenceIdentifier,
        objectFideId: statement.objectFideId,
        objectReferenceIdentifier: statement.objectReferenceIdentifier,
      },
    });

    statementRootRows.set(`${input.root}:${statementId.fingerprint}`, {
      root: input.root,
      statementFingerprint: statementId.fingerprint,
    });
  }

  return {
    root: {
      root: input.root,
      ...(input.title ? { title: input.title } : {}),
      ...(input.description ? { description: input.description } : {}),
    },
    referenceIdentifiers: Array.from(referenceIdentifierRows.values()),
    statements: Array.from(statementRows.values()),
    statementRoots: Array.from(statementRootRows.values()),
  };
}
