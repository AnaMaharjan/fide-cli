import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { getStringFlag, hasFlag, parseArgs, shouldUseJsonOutput } from "../../util/args.js";
import { renderHelp } from "../../util/help.js";
import { printJson, readUtf8, writeUtf8 } from "../../util/io.js";
import { resolveGraphTarget } from "../../util/graph/target.js";
import { getLocalFideWarnings } from "../../util/graph/local-disk-warning.js";
import { resolveStatementsBatch, ymdUtc } from "./shared.js";

function writeHelp(): string {
  return renderHelp({
    sections: [
      {
        title: "Usage",
        items: [
          "  fide graph write [--fide-dir <path>] <json>",
          "  fide graph write [--fide-dir <path>] --file <inputs> [--format <json|jsonl|fsd>]",
          "  fide graph write [--fide-dir <path>] --stdin [--format <json|jsonl|fsd>]",
        ],
      },
      {
        title: "Flags",
        items: [
          "  --fide-dir <path>             Local .fide directory override",
          "  --file <inputs>               Read statement inputs from a file",
          "  --stdin                       Read statement inputs from stdin",
          "  --format <json|jsonl|fsd>     Force input format",
          "  --no-normalize                Disable reference identifier normalization",
          "  --pretty, -p                  Human-readable output",
        ],
      },
      {
        title: "Notes",
        items: [
          "  - Writes JSONL batches under .fide/statements/YYYY/MM/DD/<root>.jsonl.",
          "  - `fide graph write` only writes statement batches to a local .fide directory.",
          "  - Use `fide graph query write` to save local query definitions.",
        ],
      },
    ],
  });
}

function resolveStatementsDir(root: string): string {
  return resolve(root, ".fide", "statements");
}

function updateDraftWriteFrontmatter(content: string, writtenAtUTC: string, writtenRoot: string): string {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(content);
  if (!match) return content;
  const lines = match[1].split("\n");
  const nextLines: string[] = [];
  let inserted = false;

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (trimmed.startsWith("writtenAtUTC:") || trimmed.startsWith("writtenRoot:")) {
      continue;
    }
    nextLines.push(rawLine);
    if (trimmed.startsWith("updatedAtUTC:")) {
      nextLines.push(`writtenAtUTC: ${writtenAtUTC}`);
      nextLines.push(`writtenRoot: ${writtenRoot}`);
      inserted = true;
    }
  }

  if (!inserted) {
    const updateCountIndex = nextLines.findIndex((line) => line.trim().startsWith("updateCount:"));
    if (updateCountIndex >= 0) {
      nextLines.splice(updateCountIndex, 0, `writtenAtUTC: ${writtenAtUTC}`, `writtenRoot: ${writtenRoot}`);
    } else {
      nextLines.push(`writtenAtUTC: ${writtenAtUTC}`);
      nextLines.push(`writtenRoot: ${writtenRoot}`);
    }
  }

  return content.replace(/^---\n[\s\S]*?\n---\n/, `---\n${nextLines.join("\n")}\n---\n`);
}

export async function runGraphWrite(argsOrFlags: string[] | Map<string, string | boolean>): Promise<number> {
  const initialParsed = argsOrFlags instanceof Map ? { positionals: [], flags: argsOrFlags } : parseArgs(argsOrFlags);
  if (hasFlag(initialParsed.flags, "help")) {
    console.log(writeHelp());
    return 0;
  }
  if (hasFlag(initialParsed.flags, "draft")) {
    throw new Error("`graph write` does not support `--draft`. Use `fide graph draft`.");
  }
  if (hasFlag(initialParsed.flags, "query")) {
    throw new Error("`graph write` no longer supports `--query`. Use `fide graph query write`.");
  }
  const { parsed, batch, statementInputs } = await resolveStatementsBatch(argsOrFlags);
  const flags = parsed.flags;

  const graphTarget = resolveGraphTarget(flags);
  if (hasFlag(flags, "out")) {
    throw new Error("`graph write` does not accept --out. Output path is auto-generated.");
  }
  if (statementInputs.length === 0) {
    console.error("Missing input for `graph write`. Use `--stdin`, `--file <path>`, or pass JSON inline.");
    console.error(writeHelp());
    return 1;
  }
  if (graphTarget.type !== "local") {
    throw new Error("`graph write` only supports local `.fide` directories. Use `fide graph query` or `fide graph build` for configured sqlite or postgres stores.");
  }

  const statementsDir = resolveStatementsDir(graphTarget.root);
  const { yyyy, mm, dd } = ymdUtc(new Date());
  const outPath = resolve(statementsDir, yyyy, mm, dd, `${batch.root}.jsonl`);
  const wires = batch.statements.map((statement) => ({
    s: statement.subjectFideId,
    sr: statement.subjectReferenceIdentifier,
    p: statement.predicateFideId,
    pr: statement.predicateReferenceIdentifier,
    o: statement.objectFideId,
    or: statement.objectReferenceIdentifier,
  }));
  const output = `${wires.map((wire) => JSON.stringify(wire)).join("\n")}\n`;
  await mkdir(resolve(outPath, ".."), { recursive: true });
  await writeUtf8(outPath, output);

  const filePath = getStringFlag(flags, "file");
  if (filePath) {
    try {
      const raw = await readUtf8(filePath);
      const nextDraft = updateDraftWriteFrontmatter(raw, new Date().toISOString(), batch.root);
      if (nextDraft !== raw) {
        await writeUtf8(filePath, nextDraft);
      }
    } catch {
      // Ignore non-draft file inputs; local canonical write already succeeded.
    }
  }

  const payload = {
    root: batch.root,
    statementCount: batch.statements.length,
    mode: "local",
    outPath,
    warnings: getLocalFideWarnings(graphTarget.root, { gitignore: graphTarget.gitignore }),
  };
  if (shouldUseJsonOutput(flags)) {
    printJson(payload);
  } else {
    console.log(outPath);
  }
  return 0;
}
