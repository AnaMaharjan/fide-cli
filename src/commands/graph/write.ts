import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { getStringFlag, hasFlag, parseArgs, shouldUseJsonOutput } from "../../util/args.js";
import { renderHelp } from "../../util/help.js";
import { printJson, readUtf8, writeUtf8 } from "../../util/io.js";
import { resolveGraphTarget } from "../../util/graph/target.js";
import { getLocalFideWarnings } from "../../util/graph/local-disk-warning.js";
import { renderQueryFile } from "../../util/query/files.js";
import { resolveStatementsBatch, ymdUtc } from "./shared.js";
import { readStdinUtf8 } from "./shared.js";

function writeHelp(): string {
  return renderHelp({
    sections: [
      {
        title: "Usage",
        items: [
          "  fide graph write [--fide-dir <path>] <json>",
          "  fide graph write [--fide-dir <path>] --file <inputs> [--format <json|jsonl|fsd>]",
          "  fide graph write [--fide-dir <path>] --stdin [--format <json|jsonl|fsd>]",
          "  fide graph write --query --store <statement-store> --name <query-name> <sql>",
          "  fide graph write --query --store <statement-store> --name <query-name> --file <query.sql>",
          "  fide graph write --query --store <statement-store> --name <query-name> --stdin",
        ],
      },
      {
        title: "Flags",
        items: [
          "  --fide-dir <path>             Local .fide directory override",
          "  --query                       Write a saved query file instead of statement inputs",
          "  --store <statement-store>     Statement store key used by a saved query",
          "  --name <query-name>           Query file name without .sql",
          "  --description <text>          Optional leading description header for a saved query",
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
          "  - With `--query`, writes SQL files under .fide/queries/<statement-store>/<query-name>.sql.",
          "  - `fide graph write` only writes to a local .fide directory. Use `fide graph sql` or `fide graph build` for configured stores.",
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

async function resolveQuerySql(args: string[]): Promise<{ parsed: ReturnType<typeof parseArgs>; sql: string }> {
  const parsed = parseArgs(args);
  const flags = parsed.flags;
  const filePath = getStringFlag(flags, "file");
  const useStdin = hasFlag(flags, "stdin");
  const stdinAvailable = process.stdin.isTTY === false;
  const inlineSql = parsed.positionals.join(" ").trim();

  if (filePath) return { parsed, sql: await readUtf8(filePath) };
  if (useStdin) return { parsed, sql: await readStdinUtf8() };
  if (inlineSql.length > 0) return { parsed, sql: inlineSql };
  if (stdinAvailable) return { parsed, sql: await readStdinUtf8() };
  return { parsed, sql: "" };
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
    if (argsOrFlags instanceof Map) {
      throw new Error("`graph write --query` requires argv input, not a pre-parsed flag map.");
    }
    const { parsed, sql } = await resolveQuerySql(argsOrFlags);
    const flags = parsed.flags;
    const statementStoreKey = getStringFlag(flags, "store");
    const name = getStringFlag(flags, "name");
    const description = getStringFlag(flags, "description");
    if (!statementStoreKey) throw new Error("Missing required flag: --store <statement-store>.");
    if (!name) throw new Error("Missing required flag: --name <query-name>.");
    if (!sql.trim()) {
      console.error("Missing SQL for `graph write --query`. Use `--stdin`, `--file <path>`, or pass SQL inline.");
      console.error(writeHelp());
      return 1;
    }

    const graphTarget = resolveGraphTarget(flags);
    if (graphTarget.type !== "local") {
      throw new Error("`fide graph write --query` only supports local .fide directories.");
    }

    const outPath = resolve(graphTarget.root, ".fide", "queries", statementStoreKey, `${name}.sql`);
    await mkdir(resolve(outPath, ".."), { recursive: true });
    await writeUtf8(outPath, renderQueryFile(sql, description));

    const payload = {
      ok: true,
      mode: "query",
      statementStoreKey,
      name,
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
    throw new Error("`graph write` only supports local `.fide` directories. Use `fide graph sql` or `fide graph build` for configured sqlite or postgres stores.");
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
