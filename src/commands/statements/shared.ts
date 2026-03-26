import { getStringFlag, hasFlag, parseArgs } from "../../util/command/args.js";
import {
  booleanKeysFromCommand,
  mergeBooleanKeySets,
  renderCommandHelp,
  type CommandDefinition,
} from "../../util/command/command-metadata.js";
import { readUtf8 } from "../../util/command/io.js";
import {
  buildStatementsWithRoot,
  detectStatementsInputFormat,
  detectStatementsInputFormatFromFilePath,
  parseStatementInputsByFormat,
  parseStatementsInputFormat,
  resolveGraphTarget,
  type StatementInput,
} from "@chris-test/graph";

let statementsInputBooleanKeysCache: ReadonlySet<string> | undefined;

async function statementsInputParseBooleanKeys(): Promise<ReadonlySet<string>> {
  if (!statementsInputBooleanKeysCache) {
    const [{ statementsWriteCommand }, { statementsDraftCommand }] = await Promise.all([
      import("./write.js"),
      import("./draft.js"),
    ]);
    statementsInputBooleanKeysCache = mergeBooleanKeySets(
      booleanKeysFromCommand(statementsWriteCommand),
      booleanKeysFromCommand(statementsDraftCommand),
    );
  }
  return statementsInputBooleanKeysCache;
}

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
  const parsed = argsOrFlags instanceof Map
    ? { positionals: [], flags: argsOrFlags }
    : parseArgs(argsOrFlags, { booleanKeys: await statementsInputParseBooleanKeys() });
  const flags = parsed.flags;
  const filePath = getStringFlag(flags, "file");
  const useStdin = hasFlag(flags, "stdin");
  const formatFlag = parseStatementsInputFormat(getStringFlag(flags, "format"));
  const normalize = !hasFlag(flags, "no-normalize");
  const stdinAvailable = process.stdin.isTTY === false;
  const inlineParams = parsed.positionals.join(" ");

  let statementInputs: StatementInput[] = [];

  if (filePath) {
    const raw = await readUtf8(filePath);
    const format = formatFlag ?? detectStatementsInputFormatFromFilePath(filePath) ?? detectStatementsInputFormat(raw);
    statementInputs = await parseStatementInputsByFormat(raw, format, {
      filePath,
      normalizeReferenceIdentifier: normalize,
    });
  } else if (useStdin) {
    const raw = await readStdinUtf8();
    const format = formatFlag ?? detectStatementsInputFormat(raw);
    statementInputs = await parseStatementInputsByFormat(raw, format, {
      normalizeReferenceIdentifier: normalize,
    });
  } else if (inlineParams && inlineParams.trim().length > 0) {
    statementInputs = await parseStatementInputsByFormat(inlineParams, formatFlag ?? "json", {
      normalizeReferenceIdentifier: normalize,
    });
  } else if (!stdinAvailable) {
    const raw = await readStdinUtf8();
    const format = formatFlag ?? detectStatementsInputFormat(raw);
    statementInputs = await parseStatementInputsByFormat(raw, format, {
      normalizeReferenceIdentifier: normalize,
    });
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

export async function resolveLocalStatementsBatchOrExit(
  argsOrFlags: string[] | Map<string, string | boolean>,
  command: CommandDefinition,
): Promise<{
  parsed: ReturnType<typeof parseArgs>;
  flags: Map<string, string | boolean>;
  statementInputs: StatementInput[];
  batch: Awaited<ReturnType<typeof buildStatementsWithRoot>>;
  graphTarget: ReturnType<typeof resolveGraphTarget>;
} | null> {
  const keys = await statementsInputParseBooleanKeys();
  const initialParsed = argsOrFlags instanceof Map
    ? { positionals: [], flags: argsOrFlags }
    : parseArgs(argsOrFlags, { booleanKeys: keys });
  if (hasFlag(initialParsed.flags, "help")) {
    console.log(renderCommandHelp(command));
    return null;
  }

  const { parsed, statementInputs, batch } = await resolveStatementsBatch(argsOrFlags);
  const flags = parsed.flags;

  if (statementInputs.length === 0) {
    console.error(`Missing input for \`${command.command}\`. Use \`--stdin\`, \`--file <path>\`, or pass JSON inline.`);
    console.error(renderCommandHelp(command));
    return null;
  }

  const graphTarget = resolveGraphTarget(flags);
  if (graphTarget.type !== "local") {
    throw new Error(`\`${command.command}\` is only supported for local .fide directories.`);
  }

  return {
    parsed,
    flags,
    statementInputs,
    batch,
    graphTarget,
  };
}
