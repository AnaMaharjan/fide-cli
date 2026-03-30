import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import {
  STANDARD_CURIE_PREFIXES,
  statementDoc,
  type StatementInput,
  type FsdDraftFrontmatter,
} from "@chris-test/graph";
import { getLocalFideWarnings } from "../../lib/project/warnings/local-warnings.js";
import { getStringFlag, hasFlag, parseArgs, shouldUseJsonOutput } from "../../util/command/args.js";
import {
  booleanKeysFromCommand,
  defineCommand,
  mergeBooleanKeySets,
  renderCommandHelp,
} from "../../util/command/command-metadata.js";
import { printJson, readUtf8, writeUtf8 } from "../../util/command/io.js";
import { formatPretty } from "../../util/command/pretty.js";
import { resolveLocalStatementsBatchOrExit } from "./shared.js";

export const statementsDraftCommand = defineCommand({
  surface: "statements.draft",
  command: "fide statements draft",
  outputType: "StatementsDraftOutput",
  summary: "Create a markdown statement draft in a local project",
  usage: [
    "fide statements draft --name <draft-name> <json>",
    "fide statements draft --name <draft-name> --stdin [--format <json|jsonl|fsd>] [--variables <json>]",
  ],
  paramOrder: ["name", "path", "description", "variables", "stdin", "format", "no-normalize", "pretty"],
  params: {
    name: { kind: "string", required: true, description: "Draft file name without .md", valueLabel: "<draft-name>" },
    path: { kind: "string", description: "Optional subdirectory under .fide/drafts/statements", valueLabel: "<draft-path>" },
    description: { kind: "string", description: "Optional draft description frontmatter", valueLabel: "<text>" },
    variables: {
      kind: "string",
      description: "JSON object of reference identifier aliases for frontmatter, e.g. '{\"action-record\":\"https://...\"}'",
      valueLabel: "<variables-json>",
    },
    stdin: { kind: "boolean", description: "Read statement inputs from stdin" },
    format: { kind: "string", enum: ["json", "jsonl", "fsd"], description: "Force input format" },
    "no-normalize": { kind: "boolean", description: "Disable reference identifier normalization" },
    pretty: { kind: "boolean", shorthand: "-p", description: "Human-readable output" },
  },
  notes: [
    "Writes to .fide/drafts/statements/<draft-path>/<draft-name>.md.",
    "Reusing the same --name and --path updates the existing draft.",
    "Reference identifier aliases from `--variables` are written under frontmatter `reference_identifiers:` using plain keys and can be used as `[@alias]`.",
    "Use `fide statements write` for canonical JSONL batches.",
    "Use `fide statements guide` to inspect statement-shape guidance and allowed entity types while preparing inputs.",
  ],
  values: [
    {
      label: "<variables-json>",
      value: '{"<alias>":"<absolute-reference-identifier>"}',
    },
    {
      label: "<alias>",
      value: 'string',
      suggested: '"action-record"',
    },
    {
      label: "<absolute-reference-identifier>",
      value: 'string',
      suggested: '"https://example.com/records/eval.md"',
    },
  ],
});

const STATEMENTS_DRAFT_PARSE_KEYS = mergeBooleanKeySets(booleanKeysFromCommand(statementsDraftCommand));

export type StatementsDraftOutput = {
  name: string;
  root: string;
  statementCount: number;
  mode: "draft";
  outPath: string;
  createdAtUTC: string;
  updatedAtUTC: string;
  updateCount: number;
  next: Record<string, unknown>;
  warnings: string[];
};

function draftHelp(): string {
  return renderCommandHelp(statementsDraftCommand);
}

const draftDefaults = {
  predicate: {
    supportedCuriePrefixes: Object.keys(STANDARD_CURIE_PREFIXES),
    prefixes: STANDARD_CURIE_PREFIXES,
  },
};

function inferUniformNodeDefaults(
  inputs: StatementInput[],
  role: "subject" | "object",
): { entityType?: StatementInput["subject"]["entityType"]; referenceType?: StatementInput["subject"]["referenceType"] } {
  const first = inputs[0]?.[role];
  if (!first) return {};

  const sameEntityType = inputs.every((input) => input[role].entityType === first.entityType);
  const sameReferenceType = inputs.every((input) => input[role].referenceType === first.referenceType);

  return {
    ...(sameEntityType ? { entityType: first.entityType } : {}),
    ...(sameReferenceType ? { referenceType: first.referenceType } : {}),
  };
}

function parseVariablesFlag(raw: string | null): Record<string, string> | undefined {
  if (!raw) return undefined;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(
      `Invalid --variables value. Expected a JSON object.${error instanceof Error ? ` ${error.message}` : ""}`,
    );
  }

  if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
    throw new Error("Invalid --variables value. Expected a JSON object.");
  }

  const aliases: Record<string, string> = {};
  for (const [rawKey, rawValue] of Object.entries(parsed)) {
    if (typeof rawValue !== "string" || rawValue.trim().length === 0) {
      throw new Error(`Invalid --variables value for ${JSON.stringify(rawKey)}. Expected a non-empty string.`);
    }

    const normalizedKey = rawKey.startsWith("@") ? rawKey.slice(1) : rawKey;
    if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(normalizedKey)) {
      throw new Error(
        `Invalid --variables key ${JSON.stringify(rawKey)}. Aliases must look like action-record and may not be numeric.`,
      );
    }
    aliases[normalizedKey] = rawValue;
  }

  return aliases;
}

export async function runStatementsDraft(args: string[]): Promise<number> {
  const initialParsed = parseArgs(args, { booleanKeys: STATEMENTS_DRAFT_PARSE_KEYS });
  if (hasFlag(initialParsed.flags, "help")) {
    console.log(draftHelp());
    return 0;
  }
  if (getStringFlag(initialParsed.flags, "file")) {
    console.error("`fide statements draft` no longer supports `--file`.");
    console.error("Pass JSON inline or use `--stdin` to draft new statements.");
    console.error(draftHelp());
    return 1;
  }
  const resolved = await resolveLocalStatementsBatchOrExit(args, statementsDraftCommand);
  if (!resolved) {
    return 0;
  }
  const { flags, batch, statementInputs, graphTarget } = resolved;
  const draftName = getStringFlag(flags, "name");
  const draftPath = getStringFlag(flags, "path");
  const descriptionFlag = getStringFlag(flags, "description");
  const variablesFlag = getStringFlag(flags, "variables");
  if (!draftName) {
    console.error("Missing required flag: --name <draft-name>.");
    console.error(draftHelp());
    return 1;
  }

  const normalizedInputs: StatementInput[] = batch.statements.map((statement, index) => {
    const original = statementInputs[index];
    if (!original) {
      throw new Error(`Missing original statement input for batch index ${index}.`);
    }

    return {
      subject: {
        referenceIdentifier: statement.subjectReferenceIdentifier,
        entityType: original.subject.entityType,
        referenceType: original.subject.referenceType,
      },
      predicate: {
        referenceIdentifier: statement.predicateReferenceIdentifier,
        entityType: "Concept",
        referenceType: "NetworkResource",
      },
      object: {
        referenceIdentifier: statement.objectReferenceIdentifier,
        entityType: original.object.entityType,
        referenceType: original.object.referenceType,
      },
    };
  });

  const outPath = draftPath
    ? resolve(graphTarget.root, ".fide", "drafts", "statements", draftPath, `${draftName}.md`)
    : resolve(graphTarget.root, ".fide", "drafts", "statements", `${draftName}.md`);
  let existingFrontmatter: Partial<FsdDraftFrontmatter> = {};
  let existingReferenceIdentifiers: Record<string, string> | undefined;
  try {
    const existingContent = await readUtf8(outPath);
    existingFrontmatter = statementDoc.parseStatementDraftFrontmatter(existingContent);
    try {
      existingReferenceIdentifiers = statementDoc.parseStatementDoc(existingContent).referenceIdentifiers;
    } catch {
      existingReferenceIdentifiers = undefined;
    }
  } catch {
    existingFrontmatter = {};
    existingReferenceIdentifiers = undefined;
  }
  const now = new Date().toISOString();
  const createdAtUTC = existingFrontmatter.createdAtUTC ?? now;
  const updatedAtUTC = now;
  const updateCount =
    existingFrontmatter.createdAtUTC && typeof existingFrontmatter.updateCount === "number"
      ? existingFrontmatter.updateCount + 1
      : 0;
  const description = descriptionFlag ?? existingFrontmatter.description ?? null;
  const inferredDefaults = {
    subject: inferUniformNodeDefaults(normalizedInputs, "subject"),
    object: inferUniformNodeDefaults(normalizedInputs, "object"),
    predicate: draftDefaults.predicate,
  };
  const referenceIdentifiers = parseVariablesFlag(variablesFlag) ?? existingReferenceIdentifiers;
  const output = statementDoc.formatStatementInputsAsStatementDraft(normalizedInputs, {
    frontmatter: {
      draftName,
      title: existingFrontmatter.title ?? statementDoc.titleFromDraftName(draftName),
      description,
      createdAtUTC,
      updatedAtUTC,
      writtenAtUTC: existingFrontmatter.writtenAtUTC ?? null,
      writtenRoot: existingFrontmatter.writtenRoot ?? null,
      updateCount,
    },
    defaults: inferredDefaults,
    referenceIdentifiers,
  });
  await mkdir(resolve(outPath, ".."), { recursive: true });
  await writeUtf8(outPath, output);

  const payload = {
    name: draftName,
    root: batch.root,
    statementCount: batch.statements.length,
    mode: "draft",
    outPath,
    createdAtUTC,
    updatedAtUTC,
    updateCount,
    next: {
      write: `fide statements write --file ${outPath}`,
    },
    warnings: getLocalFideWarnings(graphTarget.root, { gitignore: graphTarget.gitignore }),
  };
  if (shouldUseJsonOutput(flags)) {
    printJson(payload);
  } else {
    console.log(formatPretty("statements-draft.v1", payload));
  }
  return 0;
}
