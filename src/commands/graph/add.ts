import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { buildStatementsWithRoot, statementDoc } from "@chris-test/graph";
import { parseFideId, type StatementInput } from "@chris-test/fcp";
import { getStringFlag, hasFlag, parseArgs, shouldUseJsonOutput } from "../../util/args.js";
import { applyFieldMask, printJson, readUtf8, writeUtf8 } from "../../util/io.js";
import { COMMAND_SCHEMAS } from "../../util/schemas.js";
import { resolveGraphTarget } from "../../util/graph-target.js";
import { graphCommandHelp } from "./help.js";
import {
  detectStatementsInputFormat,
  parseStatementsInputFormat,
} from "../../util/statements/shared.js";
import { parseStatementInputsByFormat } from "../../util/statements/targets/parse-inputs.js";

/**
 * Resolve project statements output directory under `.fide/statements`.
 */
function resolveStatementsDir(root: string): string {
  const fideDir = resolve(root, ".fide");
  if (!existsSync(fideDir)) {
    throw new Error("No .fide folder found in the target directory. Run this command from your project root, configure .fide/settings.json, pass --target <path>, or run `fide init` first.");
  }
  return resolve(fideDir, "statements");
}

/**
 * Format a date as UTC year/month/day path segments.
 */
function ymdUtc(date: Date): { yyyy: string; mm: string; dd: string } {
  const iso = date.toISOString().slice(0, 10);
  const [yyyy, mm, dd] = iso.split("-");
  return { yyyy, mm, dd };
}

/**
 * Read all UTF-8 content from stdin.
 */
async function readStdinUtf8(): Promise<string> {
  const chunks: Buffer[] = [];

  for await (const chunk of process.stdin) {
    if (typeof chunk === "string") {
      chunks.push(Buffer.from(chunk));
    } else {
      chunks.push(chunk);
    }
  }

  return Buffer.concat(chunks).toString("utf8");
}

/**
 * Build a statements batch and write it to `.fide/statements/YYYY/MM/DD/<root>.jsonl`.
 */
export async function runGraphAdd(argsOrFlags: string[] | Map<string, string | boolean>): Promise<number> {
  const flags = argsOrFlags instanceof Map ? argsOrFlags : parseArgs(argsOrFlags).flags;
  if (hasFlag(flags, "help") || hasFlag(flags, "-h")) {
    if (shouldUseJsonOutput(flags)) {
      printJson(COMMAND_SCHEMAS["graph.add"]);
    } else {
      console.log(graphCommandHelp());
    }
    return 0;
  }

  const graphTarget = resolveGraphTarget(flags);
  if (graphTarget.type === "postgres") {
    const payload = {
      ok: false,
      command: "graph add",
      target: "postgres",
      key: graphTarget.key,
      configuredFromSettings: graphTarget.configuredFromSettings,
      databaseUrlConfigured: Boolean(graphTarget.databaseUrl),
      databaseUrlSource: graphTarget.databaseUrlSource,
      databaseUrlEnv: graphTarget.databaseUrlEnv,
      schema: graphTarget.schema,
      statementsTable: graphTarget.statementsTable,
      error: graphTarget.databaseUrl
        ? "Direct postgres writes are not implemented yet in this CLI."
        : `Missing postgres connection for graph target "${graphTarget.key ?? "unknown"}". Set FIDE_GRAPH_DATABASE_URL or configure the target in .fide/settings.json.`,
    };
    if (shouldUseJsonOutput(flags)) {
      printJson(payload);
    } else {
      console.error(payload.error);
    }
    return 1;
  }
  const { root } = graphTarget;

  const inPath = getStringFlag(flags, "in");
  const useStdin = hasFlag(flags, "stdin");
  const formatFlag = parseStatementsInputFormat(getStringFlag(flags, "format"));
  const normalize = !hasFlag(flags, "no-normalize");
  const draftMode = hasFlag(flags, "draft");
  if (hasFlag(flags, "out")) {
    throw new Error("`graph add` no longer accepts --out. Output path is auto-generated.");
  }

  const stdinAvailable = process.stdin.isTTY === false;
  const paramsJson = getStringFlag(flags, "params");
  let statementInputs: StatementInput[] = [];
  /**
   * Agent-first precedence:
   * 1. --in <file>
   * 2. --params '<json>'
   * 3. --stdin (explicit)
   * 4. Piped stdin (no flags, non-TTY stdin)
   */
  if (inPath) {
    const raw = await readUtf8(inPath);
    const format = formatFlag ?? detectStatementsInputFormat(raw);
    statementInputs = parseStatementInputsByFormat(raw, format);
  } else if (paramsJson) {
    statementInputs = parseStatementInputsByFormat(paramsJson, formatFlag ?? "json");
  } else if (useStdin) {
    const raw = await readStdinUtf8();
    const format = formatFlag ?? detectStatementsInputFormat(raw);
    statementInputs = parseStatementInputsByFormat(raw, format);
  } else {
    if (!stdinAvailable) {
      const raw = await readStdinUtf8();
      const format = formatFlag ?? detectStatementsInputFormat(raw);
      statementInputs = parseStatementInputsByFormat(raw, format);
    } else {
      console.error("Missing input for `graph add`. Use `--stdin`, `--in <path>`, or `--params '<json>'`.");
      console.error(graphCommandHelp());
      return 1;
    }
  }

  const batch = await buildStatementsWithRoot(statementInputs, { normalizeReferenceIdentifier: normalize });
  const outPath = (() => {
    const { yyyy, mm, dd } = ymdUtc(new Date());
    if (draftMode) {
      return resolve(root, ".fide", "statement-drafts", yyyy, mm, dd, `${batch.root}.md`);
    }
    return resolve(resolveStatementsDir(root), yyyy, mm, dd, `${batch.root}.jsonl`);
  })();

  let output: string;
  if (draftMode) {
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
    output = baseDoc.replace(/^---\n/, "---\ntype: fide-statements\nversion: v0\n");
  } else {
    const wires = batch.statements.map((statement) => ({
      s: statement.subjectFideId,
      sr: statement.subjectReferenceIdentifier,
      p: statement.predicateFideId,
      pr: statement.predicateReferenceIdentifier,
      o: statement.objectFideId,
      or: statement.objectReferenceIdentifier,
    }));
    output = `${wires.map((wire) => JSON.stringify(wire)).join("\n")}\n`;
  }

  await mkdir(resolve(outPath, ".."), { recursive: true });
  await writeUtf8(outPath, output);

  const payload = {
    root: batch.root,
    statementCount: batch.statements.length,
    mode: draftMode ? "draft" : "batch",
    outPath,
  };
  if (shouldUseJsonOutput(flags)) {
    printJson(applyFieldMask(payload, getStringFlag(flags, "fields")));
  } else {
    console.log(outPath);
  }
  return 0;
}
