import { getStringFlag, hasFlag, parseArgs } from "../../util/args.js";
import { readUtf8 } from "../../util/io.js";
import {
  detectStatementsInputFormat,
  detectStatementsInputFormatFromFilePath,
  parseStatementsInputFormat,
} from "../../util/statements/shared.js";
import { parseStatementInputsByFormat } from "../../util/statements/targets/parse-inputs.js";
import { buildStatementsWithRoot, type StatementInput } from "@chris-test/graph";

/**
 * Format a date as UTC year/month/day path segments.
 */
export function ymdUtc(date: Date): { yyyy: string; mm: string; dd: string } {
  const iso = date.toISOString().slice(0, 10);
  const [yyyy, mm, dd] = iso.split("-");
  return { yyyy, mm, dd };
}

/**
 * Read all UTF-8 content from stdin.
 */
export async function readStdinUtf8(): Promise<string> {
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

export async function resolveStatementInputsFromArgs(
  argsOrFlags: string[] | Map<string, string | boolean>,
): Promise<{ parsed: ReturnType<typeof parseArgs>; statementInputs: StatementInput[] }> {
  const parsed = argsOrFlags instanceof Map ? { positionals: [], flags: argsOrFlags } : parseArgs(argsOrFlags);
  const flags = parsed.flags;
  const filePath = getStringFlag(flags, "file");
  const useStdin = hasFlag(flags, "stdin");
  const formatFlag = parseStatementsInputFormat(getStringFlag(flags, "format"));
  const stdinAvailable = process.stdin.isTTY === false;
  const inlineParams = parsed.positionals.join(" ");

  let statementInputs: StatementInput[] = [];

  if (filePath) {
    const raw = await readUtf8(filePath);
    const format = formatFlag ?? detectStatementsInputFormatFromFilePath(filePath) ?? detectStatementsInputFormat(raw);
    statementInputs = parseStatementInputsByFormat(raw, format);
  } else if (useStdin) {
    const raw = await readStdinUtf8();
    const format = formatFlag ?? detectStatementsInputFormat(raw);
    statementInputs = parseStatementInputsByFormat(raw, format);
  } else if (inlineParams && inlineParams.trim().length > 0) {
    statementInputs = parseStatementInputsByFormat(inlineParams, formatFlag ?? "json");
  } else if (!stdinAvailable) {
    const raw = await readStdinUtf8();
    const format = formatFlag ?? detectStatementsInputFormat(raw);
    statementInputs = parseStatementInputsByFormat(raw, format);
  }

  return { parsed, statementInputs };
}

export async function resolveStatementsBatch(
  argsOrFlags: string[] | Map<string, string | boolean>,
): Promise<{
  parsed: ReturnType<typeof parseArgs>;
  statementInputs: StatementInput[];
  batch: Awaited<ReturnType<typeof buildStatementsWithRoot>>;
}> {
  const { parsed, statementInputs } = await resolveStatementInputsFromArgs(argsOrFlags);
  const normalize = !hasFlag(parsed.flags, "no-normalize");
  const batch = await buildStatementsWithRoot(statementInputs, { normalizeReferenceIdentifier: normalize });
  return { parsed, statementInputs, batch };
}
