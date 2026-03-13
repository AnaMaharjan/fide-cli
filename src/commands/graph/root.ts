import { getStringFlag, hasFlag, parseArgs, shouldUseJsonOutput } from "../../util/args.js";
import { printJson, readUtf8 } from "../../util/io.js";
import { COMMAND_SCHEMAS } from "../../util/schemas.js";
import { getRequiredBatchInputPath, parseStatementsInputFormat } from "../../util/statements/shared.js";
import { resolveBatchFromInput } from "../../util/statements/targets/resolve-batch.js";

/**
 * Compute and print only the deterministic root for a statements batch.
 */
export async function runStatementsRoot(args: string[]): Promise<number> {
  return runGraphRoot(args);
}

export async function runGraphRoot(args: string[]): Promise<number> {
  const { flags } = parseArgs(args);
  if (hasFlag(flags, "help") || hasFlag(flags, "-h")) {
    if (shouldUseJsonOutput(flags)) {
      printJson(COMMAND_SCHEMAS["graph.root"]);
    } else {
      console.log("Usage: fide graph root --in <input> [--format <json|jsonl|fsd>] [--pretty]");
    }
    return 0;
  }
  const inPath = getRequiredBatchInputPath(flags);
  if (!inPath) return 1;
  const format = parseStatementsInputFormat(getStringFlag(flags, "format"));

  const raw = await readUtf8(inPath);
  const parsed = await resolveBatchFromInput(raw, { format });
  const payload = { root: parsed.root };
  if (shouldUseJsonOutput(flags)) {
    printJson(payload);
  } else {
    console.log(parsed.root);
  }
  return 0;
}
