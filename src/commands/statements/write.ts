import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { getLocalFideWarnings, resolveGraphTarget } from "@chris-test/graph";
import { getStringFlag, hasFlag, parseArgs, shouldUseJsonOutput } from "../../util/command/args.js";
import { renderCommandHelp } from "../../util/command/command-metadata.js";
import { printJson, readUtf8, writeUtf8 } from "../../util/command/io.js";
import { ymdUtc } from "../../util/project/path-date.js";
import { formatPretty } from "../../util/command/pretty.js";
import { statementsWriteCommand } from "./metadata.js";
import { resolveLocalStatementsBatchOrExit } from "./shared.js";

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

export async function runStatementsWrite(argsOrFlags: string[] | Map<string, string | boolean>): Promise<number> {
  const initialParsed = argsOrFlags instanceof Map ? { positionals: [], flags: argsOrFlags } : parseArgs(argsOrFlags);
  if (hasFlag(initialParsed.flags, "help")) {
    console.log(renderCommandHelp(statementsWriteCommand));
    return 0;
  }
  if (hasFlag(initialParsed.flags, "draft")) {
    throw new Error("`statements write` does not support `--draft`. Use `fide statements draft`.");
  }
  if (hasFlag(initialParsed.flags, "query")) {
    throw new Error("`statements write` no longer supports `--query`. Use `fide query save`.");
  }
  const resolved = await resolveLocalStatementsBatchOrExit(argsOrFlags, statementsWriteCommand);
  if (!resolved) {
    return 0;
  }
  const { flags, batch, graphTarget } = resolved;
  if (hasFlag(flags, "out")) {
    throw new Error("`statements write` does not accept --out. Output path is auto-generated.");
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
    console.log(formatPretty("statements-write-local.v1", payload));
  }
  return 0;
}
