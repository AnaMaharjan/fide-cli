import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { parseFideId, statementDoc, type StatementInput } from "@chris-test/graph";
import { getStringFlag, hasFlag, parseArgs, shouldUseJsonOutput } from "../../util/args.js";
import { renderHelp } from "../../util/help.js";
import { applyFieldMask, printJson, writeUtf8 } from "../../util/io.js";
import { resolveGraphTarget } from "../../util/graph-target.js";
import { resolveStatementsBatch, ymdUtc } from "./shared.js";

function draftHelp(): string {
  return renderHelp({
    sections: [
      {
        title: "Usage",
        items: [
          "  fide graph draft [--target <key-or-path>] <json>",
          "  fide graph draft [--target <key-or-path>] --file <inputs> [--format <json|jsonl|fsd>]",
          "  fide graph draft [--target <key-or-path>] --stdin [--format <json|jsonl|fsd>]",
        ],
      },
      {
        title: "Flags",
        items: [
          "  --target <key-or-path>   Configured graph target key or jsonl directory path",
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
          "  - Writes a markdown statement draft to .fide/drafts/statements/YYYY/MM/DD/<root>.md.",
          "  - Jsonl targets only.",
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
  if (statementInputs.length === 0) {
    console.error("Missing input for `graph draft`. Use `--stdin`, `--file <path>`, or pass JSON inline.");
    console.error(draftHelp());
    return 1;
  }

  const graphTarget = resolveGraphTarget(flags);
  if (graphTarget.type !== "jsonl") {
    throw new Error("`graph draft` is only supported for jsonl graph targets.");
  }

  const fideDir = resolve(graphTarget.root, ".fide");
  if (!existsSync(fideDir)) {
    throw new Error("No .fide folder found in the target directory. Run this command from your project root, configure .fide/settings.json, pass --target <path>, or run `fide graph init` first.");
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

  const { yyyy, mm, dd } = ymdUtc(new Date());
  const outPath = resolve(graphTarget.root, ".fide", "drafts", "statements", yyyy, mm, dd, `${batch.root}.md`);
  await mkdir(resolve(outPath, ".."), { recursive: true });
  await writeUtf8(outPath, output);

  const payload = {
    root: batch.root,
    statementCount: batch.statements.length,
    mode: "draft",
    outPath,
  };
  if (shouldUseJsonOutput(flags)) {
    printJson(applyFieldMask(payload, getStringFlag(flags, "fields")));
  } else {
    console.log(outPath);
  }
  return 0;
}
