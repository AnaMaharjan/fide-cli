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
  buildStatementsWithRootFromRecipe,
  classifyJsonStatementDocumentRows,
  parseJsonInputs,
  parseJsonStatementRecipeDocument,
  type Statement,
  type StatementInput,
  type StatementInputsJsonRecipeFile,
  type StatementRecipeRow,
} from "@chris-test/graph";
import { resolveGraphTarget } from "../../lib/project/config/project-settings.js";
import {
  detectStatementsInputFormat,
  detectStatementsInputFormatFromFilePath,
  parseStatementsInputFormat,
} from "../../lib/statements/input/shared.js";
import { parseStatementInputsByFormat } from "../../lib/statements/input/targets/parse-inputs.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function statementInputsFromRecipeAndBuiltStatements(
  sortedRows: StatementRecipeRow[],
  statements: Statement[],
): StatementInput[] {
  if (sortedRows.length !== statements.length) {
    throw new Error("Internal error: recipe row count does not match built statement count.");
  }
  return sortedRows.map((row, i) => {
    const st = statements[i]!;
    return {
      subject: {
        referenceIdentifier: st.subjectReferenceIdentifier,
        entityType: row.subject.entityType,
        referenceType: row.subject.referenceType,
      },
      predicate: {
        referenceIdentifier: st.predicateReferenceIdentifier,
        entityType: row.predicate.entityType,
        referenceType: row.predicate.referenceType,
      },
      object: {
        referenceIdentifier: st.objectReferenceIdentifier,
        entityType: row.object.entityType,
        referenceType: row.object.referenceType,
      },
    };
  });
}

export type StatementsPayload =
  | { kind: "inputs"; statementInputs: StatementInput[] }
  | { kind: "recipe"; recipe: StatementInputsJsonRecipeFile };

let statementsInputBooleanKeysCache: ReadonlySet<string> | undefined;

function rejectDeprecatedFideDir(flags: Map<string, string | boolean>, command: string): void {
  if (!flags.has("fide-dir")) return;
  throw new Error(`\`${command}\` no longer supports \`--fide-dir\`. Run the command from the target project root or set \`FIDE_DIR\` in the environment.`);
}

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

export async function resolveStatementPayloadFromArgs(
  argsOrFlags: string[] | Map<string, string | boolean>,
): Promise<{ parsed: ReturnType<typeof parseArgs>; payload: StatementsPayload }> {
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

  let payload: StatementsPayload | undefined;

  async function jsonPayloadFromRaw(raw: string): Promise<StatementsPayload> {
    const trimmed = raw.trim();
    const outer = JSON.parse(trimmed) as unknown;
    if (isRecord(outer) && Array.isArray(outer.statements)) {
      const rowKind = classifyJsonStatementDocumentRows(outer.statements);
      if (rowKind === "recipe") {
        return { kind: "recipe", recipe: parseJsonStatementRecipeDocument(trimmed) };
      }
    }
    return { kind: "inputs", statementInputs: parseJsonInputs(trimmed) };
  }

  if (filePath) {
    const raw = await readUtf8(filePath);
    const format = formatFlag ?? detectStatementsInputFormatFromFilePath(filePath) ?? detectStatementsInputFormat(raw);
    if (format === "json") {
      payload = await jsonPayloadFromRaw(raw);
    } else {
      payload = {
        kind: "inputs",
        statementInputs: await parseStatementInputsByFormat(raw, format, {
          filePath,
          normalizeReferenceIdentifier: normalize,
        }),
      };
    }
  } else if (useStdin) {
    const raw = await readStdinUtf8();
    const format = formatFlag ?? detectStatementsInputFormat(raw);
    if (format === "json") {
      payload = await jsonPayloadFromRaw(raw);
    } else {
      payload = {
        kind: "inputs",
        statementInputs: await parseStatementInputsByFormat(raw, format, {
          normalizeReferenceIdentifier: normalize,
        }),
      };
    }
  } else if (inlineParams && inlineParams.trim().length > 0) {
    const format = formatFlag ?? "json";
    if (format === "json") {
      payload = await jsonPayloadFromRaw(inlineParams);
    } else {
      payload = {
        kind: "inputs",
        statementInputs: await parseStatementInputsByFormat(inlineParams, format, {
          normalizeReferenceIdentifier: normalize,
        }),
      };
    }
  } else if (!stdinAvailable) {
    const raw = await readStdinUtf8();
    const format = formatFlag ?? detectStatementsInputFormat(raw);
    if (format === "json") {
      payload = await jsonPayloadFromRaw(raw);
    } else {
      payload = {
        kind: "inputs",
        statementInputs: await parseStatementInputsByFormat(raw, format, {
          normalizeReferenceIdentifier: normalize,
        }),
      };
    }
  }

  return { parsed, payload: payload ?? { kind: "inputs", statementInputs: [] } };
}

export async function resolveStatementsBatch(
  argsOrFlags: string[] | Map<string, string | boolean>,
): Promise<{
  parsed: ReturnType<typeof parseArgs>;
  statementInputs: StatementInput[];
  batch: Awaited<ReturnType<typeof buildStatementsWithRoot>>;
}> {
  const { parsed, payload } = await resolveStatementPayloadFromArgs(argsOrFlags);
  const normalize = !hasFlag(parsed.flags, "no-normalize");
  const buildOpts = { normalizeReferenceIdentifier: normalize };

  if (payload.kind === "recipe") {
    const batch = await buildStatementsWithRootFromRecipe(payload.recipe.statements, buildOpts);
    const sortedRows = [...payload.recipe.statements].sort((a, b) => a.batch_index - b.batch_index);
    const statementInputs = statementInputsFromRecipeAndBuiltStatements(sortedRows, batch.statements);
    return { parsed, statementInputs, batch };
  }

  const batch = await buildStatementsWithRoot(payload.statementInputs, buildOpts);
  return { parsed, statementInputs: payload.statementInputs, batch };
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
  rejectDeprecatedFideDir(flags, command.command);

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
