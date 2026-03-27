import { parseFideId, type Statement } from "@chris-test/graph";

export type GraphRootRow = {
  root: string;
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
  predicateFingerprint: string;
  objectType: string;
  objectReferenceType: string;
  objectFingerprint: string;
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

function assertStatementHasId(statement: Statement): asserts statement is Statement & { statementFideId: string } {
  if (!statement.statementFideId) {
    throw new Error("Invalid statement: missing statementFideId.");
  }
}

export function transformStatementBatchToGraphRows(
  input: { root: string; statements: Statement[] },
): GraphStatementBatchRows {
  const referenceIdentifierRows = new Map<string, GraphReferenceIdentifierRow>();
  const statementRows = new Map<string, GraphStatementRow>();
  const statementRootRows = new Map<string, GraphStatementRootRow>();

  for (const statement of input.statements) {
    assertStatementHasId(statement);

    const subject = parseFideId(statement.subjectFideId);
    const predicate = parseFideId(statement.predicateFideId);
    const object = parseFideId(statement.objectFideId);
    const statementId = parseFideId(statement.statementFideId);

    referenceIdentifierRows.set(subject.fingerprint, {
      identifierFingerprint: subject.fingerprint,
      referenceIdentifier: statement.subjectReferenceIdentifier,
    });
    referenceIdentifierRows.set(predicate.fingerprint, {
      identifierFingerprint: predicate.fingerprint,
      referenceIdentifier: statement.predicateReferenceIdentifier,
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
      predicateFingerprint: predicate.fingerprint,
      objectType: object.typeChar,
      objectReferenceType: object.referenceChar,
      objectFingerprint: object.fingerprint,
    });

    statementRootRows.set(`${input.root}:${statementId.fingerprint}`, {
      root: input.root,
      statementFingerprint: statementId.fingerprint,
    });
  }

  return {
    root: { root: input.root },
    referenceIdentifiers: Array.from(referenceIdentifierRows.values()),
    statements: Array.from(statementRows.values()),
    statementRoots: Array.from(statementRootRows.values()),
  };
}
