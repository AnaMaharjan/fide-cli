import { getStringFlag, hasFlag, parseArgs, shouldUseJsonOutput } from "../../util/args.js";
import { applyFieldMask, printJson, readUtf8 } from "../../util/io.js";
import { COMMAND_SCHEMAS } from "../../util/schemas.js";
import { getRequiredBatchInputPath, parseStatementsInputFormat } from "../../util/statements/shared.js";
import { resolveBatchFromInput } from "../../util/statements/targets/resolve-batch.js";

/**
 * Validate a statements batch input and print the computed root.
 */
export async function runStatementsValidate(args: string[]): Promise<number> {
  return runGraphValidate(args);
}

export async function runGraphValidate(args: string[]): Promise<number> {
  const { flags } = parseArgs(args);
  if (hasFlag(flags, "help") || hasFlag(flags, "-h")) {
    if (shouldUseJsonOutput(flags)) {
      printJson(COMMAND_SCHEMAS["graph.validate"]);
    } else {
      console.log("Usage: fide graph validate --in <input> [--format <json|jsonl|fsd>] [--fields <mask>] [--pretty]");
    }
    return 0;
  }
  const inPath = getRequiredBatchInputPath(flags);
  if (!inPath) return 1;
  const format = parseStatementsInputFormat(getStringFlag(flags, "format"));

  const raw = await readUtf8(inPath);
  const parsed = await resolveBatchFromInput(raw, { format });
  const payload = {
    ok: true,
    statementCount: parsed.statementCount,
    root: parsed.root,
  };

  if (shouldUseJsonOutput(flags)) {
    printJson(applyFieldMask(payload, getStringFlag(flags, "fields")));
  } else {
    console.log(`OK statements=${payload.statementCount} root=${payload.root}`);
  }
  return 0;
}
