import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { buildStatementsWithRoot, statementDoc, type Statement, type StatementInput } from "@chris-test/graph";

type ParseStatementDocInputsOptions = {
  filePath?: string;
  normalizeReferenceIdentifier?: boolean;
};

type ResolvedStatementDoc = {
  builtStatements: Statement[];
  statementInputs: StatementInput[];
};

type ResolveContext = {
  normalizeReferenceIdentifier: boolean;
  cache: Map<string, Promise<ResolvedStatementDoc>>;
  activeFiles: Set<string>;
};

const LOCAL_STATEMENT_REF_PATTERN = /^(?:@(\d+)|(.+?)@(\d+))$/;

function buildStatementReferenceIdentifier(statement: Statement): string {
  return `${statement.subjectFideId}|${statement.predicateFideId}|${statement.objectFideId}`;
}

function getLabelForStatement(
  statement: (typeof statementDoc.v0.parseStatementDoc extends (...args: any[]) => infer R ? R : never)["statements"][number],
  index: number,
): number {
  return statement.localIndex ?? index + 1;
}

async function resolveReferencedStatement(
  referenceIdentifier: string,
  currentFilePath: string | undefined,
  currentBuiltStatements: Statement[],
  currentStatements: ReturnType<typeof statementDoc.v0.parseStatementDoc>["statements"],
  currentIndex: number,
  context: ResolveContext,
  line: number,
): Promise<Statement> {
  const match = referenceIdentifier.match(LOCAL_STATEMENT_REF_PATTERN);
  if (!match) {
    throw new Error(`Invalid local statement reference ${JSON.stringify(referenceIdentifier)} at line ${line}. Expected @<n> or <relative-path>@<n>.`);
  }

  const [, localLabelRaw, relativePathRaw, fileLabelRaw] = match;
  const targetLabel = Number.parseInt(localLabelRaw ?? fileLabelRaw ?? "", 10);
  if (!Number.isFinite(targetLabel) || targetLabel < 1) {
    throw new Error(`Invalid local statement label ${JSON.stringify(referenceIdentifier)} at line ${line}. Labels start at 1.`);
  }

  if (!relativePathRaw) {
    const targetIndex = currentStatements.findIndex((statement, index) => getLabelForStatement(statement, index) === targetLabel);
    if (targetIndex === -1) {
      throw new Error(`Unknown local statement reference @${targetLabel} at line ${line}.`);
    }
    if (targetIndex >= currentIndex) {
      throw new Error(`Forward local statement reference @${targetLabel} at line ${line} is not supported. Reference an earlier statement.`);
    }
    const referenced = currentBuiltStatements[targetIndex];
    if (!referenced) {
      throw new Error(`Local statement reference @${targetLabel} at line ${line} could not be resolved.`);
    }
    return referenced;
  }

  if (!currentFilePath) {
    throw new Error(`Cross-file statement reference ${JSON.stringify(referenceIdentifier)} at line ${line} requires a file-backed statement draft.`);
  }

  const targetFilePath = resolve(dirname(currentFilePath), relativePathRaw);
  if (targetFilePath === currentFilePath) {
    const targetIndex = currentStatements.findIndex((statement, index) => getLabelForStatement(statement, index) === targetLabel);
    if (targetIndex === -1) {
      throw new Error(`Unknown local statement reference ${JSON.stringify(referenceIdentifier)} at line ${line}.`);
    }
    if (targetIndex >= currentIndex) {
      throw new Error(`Forward local statement reference ${JSON.stringify(referenceIdentifier)} at line ${line} is not supported. Reference an earlier statement.`);
    }
    const referenced = currentBuiltStatements[targetIndex];
    if (!referenced) {
      throw new Error(`Local statement reference ${JSON.stringify(referenceIdentifier)} at line ${line} could not be resolved.`);
    }
    return referenced;
  }
  const resolvedDoc = await resolveStatementDocFile(targetFilePath, context);
  const targetIndex = resolvedDoc.builtStatements.findIndex((_, index) => index + 1 === targetLabel);
  if (targetIndex === -1) {
    throw new Error(`Unknown cross-file statement reference ${JSON.stringify(referenceIdentifier)} at line ${line}.`);
  }
  return resolvedDoc.builtStatements[targetIndex]!;
}

async function resolveStatementDocParsed(
  parsed: ReturnType<typeof statementDoc.v0.parseStatementDoc>,
  currentFilePath: string | undefined,
  context: ResolveContext,
): Promise<ResolvedStatementDoc> {
  const statementInputs: StatementInput[] = [];
  const builtStatements: Statement[] = [];

  for (const [index, item] of parsed.statements.entries()) {
    const resolveNode = async (node: typeof item.subject): Promise<typeof item.subject> => {
      if (node.entityType !== "Statement" || node.referenceType !== "Statement") {
        return node;
      }
      const referenced = await resolveReferencedStatement(
        node.referenceIdentifier,
        currentFilePath,
        builtStatements,
        parsed.statements,
        index,
        context,
        item.line,
      );
      return {
        ...node,
        referenceIdentifier: buildStatementReferenceIdentifier(referenced),
      };
    };

    const subject = await resolveNode(item.subject);
    const object = await resolveNode(item.object);

    if (!subject.entityType || !subject.referenceType) {
      throw new Error(`Subject defaults did not resolve to a complete node token at line ${item.line}.`);
    }
    if (!object.entityType || !object.referenceType) {
      throw new Error(`Object defaults did not resolve to a complete node token at line ${item.line}.`);
    }

    const input: StatementInput = {
      subject: {
        referenceIdentifier: subject.referenceIdentifier,
        entityType: subject.entityType,
        referenceType: subject.referenceType,
      },
      predicate: {
        referenceIdentifier: item.predicateReferenceIdentifier,
        entityType: "Concept",
        referenceType: "NetworkResource",
      },
      object: {
        referenceIdentifier: object.referenceIdentifier,
        entityType: object.entityType,
        referenceType: object.referenceType,
      },
    };
    statementInputs.push(input);
    const built = await buildStatementsWithRoot([input], {
      normalizeReferenceIdentifier: context.normalizeReferenceIdentifier,
    });
    builtStatements.push(built.statements[0]!);
  }

  return { builtStatements, statementInputs };
}

async function resolveStatementDocFile(filePath: string, context: ResolveContext): Promise<ResolvedStatementDoc> {
  const existing = context.cache.get(filePath);
  if (existing) {
    if (context.activeFiles.has(filePath)) {
      throw new Error(`Cyclic cross-file statement reference detected while loading ${filePath}.`);
    }
    return existing;
  }

  const promise = (async () => {
    context.activeFiles.add(filePath);
    const raw = await readFile(filePath, "utf8");
    const parsed = statementDoc.v0.parseStatementDoc(raw);
    try {
      return await resolveStatementDocParsed(parsed, filePath, context);
    } finally {
      context.activeFiles.delete(filePath);
    }
  })();
  context.cache.set(filePath, promise);
  return promise;
}

/**
 * Parse statement-doc markdown into canonical `StatementInput[]`.
 *
 * Supports draft-local statement references like:
 * - [Statement/Statement:@2]
 * - [Statement/Statement:cli-principles.md@2]
 * - [Statement/Statement:../folder/file.md@2]
 */
export async function parseStatementDocInputs(
  raw: string,
  options: ParseStatementDocInputsOptions = {},
): Promise<StatementInput[]> {
  const context: ResolveContext = {
    normalizeReferenceIdentifier: options.normalizeReferenceIdentifier === true,
    cache: new Map(),
    activeFiles: new Set(),
  };
  const parsed = statementDoc.v0.parseStatementDoc(raw);
  const resolved = await resolveStatementDocParsed(parsed, options.filePath, context);
  return resolved.statementInputs;
}
