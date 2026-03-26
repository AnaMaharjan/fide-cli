import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import {
  getLocalFideWarnings,
  resolveGraphTarget,
  STANDARD_CURIE_PREFIXES,
  statementDoc,
  type StatementInput,
  type FsdDraftFrontmatter,
} from "@chris-test/graph";
import { getStringFlag, hasFlag, parseArgs, shouldUseJsonOutput } from "../../util/command/args.js";
import { printJson, readUtf8, writeUtf8 } from "../../util/command/io.js";
import { formatPretty } from "../../util/command/pretty.js";
import { renderCommandHelp } from "../../util/command/command-metadata.js";
import { statementsDraftCommand } from "./metadata.js";
import { resolveLocalStatementsBatchOrExit } from "./shared.js";

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

export async function runStatementsDraft(args: string[]): Promise<number> {
  const initialParsed = parseArgs(args);
  if (hasFlag(initialParsed.flags, "help")) {
    console.log(draftHelp());
    return 0;
  }
  const resolved = await resolveLocalStatementsBatchOrExit(args, statementsDraftCommand);
  if (!resolved) {
    return 0;
  }
  const { flags, batch, statementInputs, graphTarget } = resolved;
  const draftName = getStringFlag(flags, "name");
  const draftPath = getStringFlag(flags, "path");
  const descriptionFlag = getStringFlag(flags, "description");
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
  try {
    existingFrontmatter = statementDoc.parseStatementDraftFrontmatter(await readUtf8(outPath));
  } catch {
    existingFrontmatter = {};
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
