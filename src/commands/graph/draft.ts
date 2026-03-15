import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { parseFideId, statementDoc, type StatementInput } from "@chris-test/graph";
import { getStringFlag, hasFlag, parseArgs, shouldUseJsonOutput } from "../../util/args.js";
import { renderHelp } from "../../util/help.js";
import { applyFieldMask, printJson, writeUtf8 } from "../../util/io.js";
import { resolveGraphTarget } from "../../util/graph/target.js";
import { getLocalFideWarnings } from "../../util/graph/local-disk-warning.js";
import { resolveStatementsBatch } from "./shared.js";

function draftHelp(): string {
  return renderHelp({
    sections: [
      {
        title: "Usage",
        items: [
          "  fide graph draft [--fide-dir <path>] --name <draft-name> <json>",
          "  fide graph draft [--fide-dir <path>] --name <draft-name> --file <inputs> [--format <json|jsonl|fsd>]",
          "  fide graph draft [--fide-dir <path>] --name <draft-name> --stdin [--format <json|jsonl|fsd>]",
        ],
      },
      {
        title: "Flags",
        items: [
          "  --fide-dir <path>        Local .fide directory override",
          "  --name <draft-name>      Draft file name without .md",
          "  --path <draft-path>      Optional subdirectory under .fide/drafts/statements",
          "  --file <inputs>          Read statement inputs from a file",
          "  --stdin                  Read statement inputs from stdin",
          "  --format <json|jsonl|fsd>  Force input format",
          "  --no-normalize           Disable reference identifier normalization",
          "  --pretty, -p             Human-readable output",
        ],
      },
      {
        title: "Notes",
        items: [
          "  - Writes markdown drafts under .fide/drafts/statements/<draft-path>/<draft-name>.md.",
          "  - Use --path to organize drafts by feature, workflow, or topic.",
        ],
      },
    ],
  });
}

export async function runGraphDraft(args: string[]): Promise<number> {
  const initialParsed = parseArgs(args);
  if (hasFlag(initialParsed.flags, "help")) {
    console.log(draftHelp());
    return 0;
  }
  const { parsed, batch, statementInputs } = await resolveStatementsBatch(args);
  const flags = parsed.flags;
  const draftName = getStringFlag(flags, "name");
  const draftPath = getStringFlag(flags, "path");
  if (statementInputs.length === 0) {
    console.error("Missing input for `graph draft`. Use `--stdin`, `--file <path>`, or pass JSON inline.");
    console.error(draftHelp());
    return 1;
  }
  if (!draftName) {
    console.error("Missing required flag: --name <draft-name>.");
    console.error(draftHelp());
    return 1;
  }

  const graphTarget = resolveGraphTarget(flags);
  if (graphTarget.type !== "local") {
    throw new Error("`graph draft` is only supported for local .fide directories.");
  }

  const normalizedInputs: StatementInput[] = batch.statements.map((statement) => ({
    subject: {
      referenceIdentifier: statement.subjectReferenceIdentifier,
      entityType: parseFideId(statement.subjectFideId).entityType,
      referenceType: parseFideId(statement.subjectFideId).referenceType,
    },
    predicate: {
      referenceIdentifier: statement.predicateReferenceIdentifier,
      entityType: "Concept",
      referenceType: "NetworkResource",
    },
    object: {
      referenceIdentifier: statement.objectReferenceIdentifier,
      entityType: parseFideId(statement.objectFideId).entityType,
      referenceType: parseFideId(statement.objectFideId).referenceType,
    },
  }));

  const baseDoc = statementDoc.v0.formatStatementInputsAsStatementDoc(normalizedInputs, {
    defaults: {
      subject: { referenceType: "NetworkResource" },
      object: { referenceType: "NetworkResource" },
    },
  });
  const output = baseDoc.replace(/^---\n/, "---\ntype: fide-statements\nversion: v0\n");

  const outPath = draftPath
    ? resolve(graphTarget.root, ".fide", "drafts", "statements", draftPath, `${draftName}.md`)
    : resolve(graphTarget.root, ".fide", "drafts", "statements", `${draftName}.md`);
  await mkdir(resolve(outPath, ".."), { recursive: true });
  await writeUtf8(outPath, output);

  const payload = {
    name: draftName,
    root: batch.root,
    statementCount: batch.statements.length,
    mode: "draft",
    outPath,
    warnings: getLocalFideWarnings(graphTarget.root, { gitignore: graphTarget.gitignore }),
  };
  if (shouldUseJsonOutput(flags)) {
    printJson(applyFieldMask(payload, getStringFlag(flags, "fields")));
  } else {
    console.log(outPath);
  }
  return 0;
}
