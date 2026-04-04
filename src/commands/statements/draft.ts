import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import {
  STANDARD_CURIE_PREFIXES,
  statementDoc,
  type StatementInput,
  type FsdDraftFrontmatter,
  type FsdCuriePrefixes,
  type FsdEntityDeclarationMap,
  type FsdReferenceIdentifierMap,
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
      description:
        "JSON object for frontmatter variables. Optional top-level keys: reference_identifiers, curie_prefixes, entity_declarations.",
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
    "Use `fide statements write` for canonical JSONL batches.",
    "Use `fide statements guide` to inspect statement-shape guidance and allowed entity types while preparing inputs.",
  ],
  values: [
    {
      label: "<variables-json>",
      children: [
        {
          label: '"reference_identifiers"',
          value: "<reference_identifiers>",
        },
        {
          label: '"curie_prefixes"',
          value: "<curie_prefixes>",
        },
        {
          label: '"entity_declarations"',
          value: "<entity_declarations>",
        },
      ],
    },
    {
      label: "<reference_identifiers>",
      children: [
        {
          label: "<reference-identifier-key>",
          value: "<reference-identifier>",
        },
      ],
    },
    {
      label: "<reference-identifier-key>",
      value: "string",
      suggested: '"resource_alias"',
    },
    {
      label: "<reference-identifier>",
      value: "string",
      suggested: '"https://example.com/resource"',
    },
    {
      label: "<curie_prefixes>",
      children: [
        {
          label: '"supported"',
          value: '["<supported-curie-prefix>"...]',
        },
        {
          label: '"custom"',
          children: [
            {
              label: "<custom-curie-prefix>",
              value: "<custom-curie-url-prefix>",
            },
          ],
        },
      ],
    },
    {
      label: "<supported-curie-prefix>",
      value: "string",
      suggested: '"schema"',
    },
    {
      label: "<custom-curie-prefix>",
      value: "string",
      suggested: '"custom"',
    },
    {
      label: "<custom-curie-url-prefix>",
      value: "string",
      suggested: '"https://example.com/vocab/"',
    },
    {
      label: "<entity_declarations>",
      children: [
        {
          label: "<entity-declaration-key>",
          value: "<entity_declaration>",
        },
      ],
    },
    {
      label: "<entity-declaration-key>",
      value: "string",
      suggested: '"entity_alias"',
    },
    {
      label: "<entity_declaration>",
      children: [
        {
          label: '"name"',
          value: "<entity-declaration-name>",
        },
        {
          label: '"description"',
          value: "<entity-declaration-description>",
        },
      ],
    },
    {
      label: "<entity-declaration-name>",
      value: "string",
      suggested: '"Entity Name"',
    },
    {
      label: "<entity-declaration-description>",
      value: "string",
      suggested: '"Short description of the declared entity."',
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
  curiePrefixes: {
    supported: Object.keys(STANDARD_CURIE_PREFIXES),
    custom: STANDARD_CURIE_PREFIXES,
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

type DraftVariablesInput = {
  referenceIdentifiers?: FsdReferenceIdentifierMap;
  curiePrefixes?: FsdCuriePrefixes;
  entityDeclarations?: FsdEntityDeclarationMap;
};

function parseReferenceIdentifiersValue(raw: unknown): FsdReferenceIdentifierMap | undefined {
  if (raw === undefined) return undefined;
  if (!raw || Array.isArray(raw) || typeof raw !== "object") {
    throw new Error("Invalid --variables.reference_identifiers value. Expected a JSON object.");
  }

  const aliases: Record<string, string> = {};
  for (const [rawKey, rawValue] of Object.entries(raw)) {
    if (typeof rawValue !== "string" || rawValue.trim().length === 0) {
      throw new Error(`Invalid --variables.reference_identifiers value for ${JSON.stringify(rawKey)}. Expected a non-empty string.`);
    }

    const normalizedKey = rawKey.startsWith("@") ? rawKey.slice(1) : rawKey;
    if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(normalizedKey)) {
      throw new Error(
        `Invalid --variables.reference_identifiers key ${JSON.stringify(rawKey)}. Keys must look like action-record and may not be numeric.`,
      );
    }
    aliases[normalizedKey] = rawValue;
  }

  return aliases;
}

function parseCuriePrefixesValue(raw: unknown): FsdCuriePrefixes | undefined {
  if (raw === undefined) return undefined;
  if (!raw || Array.isArray(raw) || typeof raw !== "object") {
    throw new Error("Invalid --variables.curie_prefixes value. Expected a JSON object.");
  }

  const parsed = raw as { supported?: unknown; custom?: unknown };
  const supportedRaw = parsed.supported;
  const customRaw = parsed.custom;

  const supported =
    supportedRaw === undefined
      ? undefined
      : (() => {
          if (!Array.isArray(supportedRaw)) {
            throw new Error("Invalid --variables.curie_prefixes.supported value. Expected an array of strings.");
          }
          return supportedRaw.map((item) => {
            if (typeof item !== "string" || item.trim().length === 0) {
              throw new Error("Invalid --variables.curie_prefixes.supported value. Expected an array of non-empty strings.");
            }
            return item;
          });
        })();

  const custom =
    customRaw === undefined
      ? undefined
      : (() => {
          if (!customRaw || Array.isArray(customRaw) || typeof customRaw !== "object") {
            throw new Error("Invalid --variables.curie_prefixes.custom value. Expected a JSON object.");
          }
          const out: Record<string, string> = {};
          for (const [key, value] of Object.entries(customRaw)) {
            if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(key)) {
              throw new Error(`Invalid --variables.curie_prefixes.custom key ${JSON.stringify(key)}.`);
            }
            if (typeof value !== "string" || value.trim().length === 0) {
              throw new Error(`Invalid --variables.curie_prefixes.custom value for ${JSON.stringify(key)}. Expected a non-empty string.`);
            }
            out[key] = value;
          }
          return out;
        })();

  return { supported, custom };
}

function parseEntityDeclarationsValue(raw: unknown): FsdEntityDeclarationMap | undefined {
  if (raw === undefined) return undefined;
  if (!raw || Array.isArray(raw) || typeof raw !== "object") {
    throw new Error("Invalid --variables.entity_declarations value. Expected a JSON object.");
  }

  const out: FsdEntityDeclarationMap = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(key)) {
      throw new Error(`Invalid --variables.entity_declarations key ${JSON.stringify(key)}.`);
    }
    if (!value || Array.isArray(value) || typeof value !== "object") {
      throw new Error(`Invalid --variables.entity_declarations value for ${JSON.stringify(key)}. Expected an object with name and description.`);
    }
    const { name, description } = value as { name?: unknown; description?: unknown };
    if (typeof name !== "string" || name.trim().length === 0) {
      throw new Error(`Invalid --variables.entity_declarations.${key}.name. Expected a non-empty string.`);
    }
    if (typeof description !== "string" || description.trim().length === 0) {
      throw new Error(`Invalid --variables.entity_declarations.${key}.description. Expected a non-empty string.`);
    }
    out[key] = { name, description };
  }

  return out;
}

function parseVariablesFlag(raw: string | null): DraftVariablesInput | undefined {
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

  const allowedKeys = new Set(["reference_identifiers", "curie_prefixes", "entity_declarations"]);
  for (const key of Object.keys(parsed)) {
    if (!allowedKeys.has(key)) {
      throw new Error(
        `Invalid --variables key ${JSON.stringify(key)}. Expected one of: reference_identifiers, curie_prefixes, entity_declarations.`,
      );
    }
  }

  return {
    referenceIdentifiers: parseReferenceIdentifiersValue((parsed as Record<string, unknown>).reference_identifiers),
    curiePrefixes: parseCuriePrefixesValue((parsed as Record<string, unknown>).curie_prefixes),
    entityDeclarations: parseEntityDeclarationsValue((parsed as Record<string, unknown>).entity_declarations),
  };
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
  let existingCuriePrefixes: FsdCuriePrefixes | undefined;
  let existingEntityDeclarations: FsdEntityDeclarationMap | undefined;
  try {
    const existingContent = await readUtf8(outPath);
    existingFrontmatter = statementDoc.parseStatementDraftFrontmatter(existingContent);
    try {
      const parsedExisting = statementDoc.parseStatementDoc(existingContent);
      existingReferenceIdentifiers = parsedExisting.referenceIdentifiers;
      existingCuriePrefixes = parsedExisting.curiePrefixes;
      existingEntityDeclarations = parsedExisting.entityDeclarations;
    } catch {
      existingReferenceIdentifiers = undefined;
      existingCuriePrefixes = undefined;
      existingEntityDeclarations = undefined;
    }
  } catch {
    existingFrontmatter = {};
    existingReferenceIdentifiers = undefined;
    existingCuriePrefixes = undefined;
    existingEntityDeclarations = undefined;
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
  };
  const parsedVariables = parseVariablesFlag(variablesFlag);
  const referenceIdentifiers = parsedVariables?.referenceIdentifiers ?? existingReferenceIdentifiers;
  const curiePrefixes = parsedVariables?.curiePrefixes ?? existingCuriePrefixes ?? draftDefaults.curiePrefixes;
  const entityDeclarations = parsedVariables?.entityDeclarations ?? existingEntityDeclarations;
  const output = statementDoc.formatStatementInputsAsStatementDraft(normalizedInputs, {
    frontmatter: {
      draftName,
      title: existingFrontmatter.title ?? statementDoc.titleFromDraftName(draftName),
      description,
      createdAtUTC,
      updatedAtUTC,
      writtenRoot: existingFrontmatter.writtenRoot ?? null,
      updateCount,
    },
    defaults: inferredDefaults,
    curiePrefixes,
    referenceIdentifiers,
    entityDeclarations,
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
