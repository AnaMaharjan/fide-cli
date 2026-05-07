import { parseArgs, getStringFlag } from "../../util/command/args.js";
import { booleanKeysFromCommand, defineCommand, mergeBooleanKeySets, renderCommandHelp } from "../../util/command/command-metadata.js";
import { printJson } from "../../util/command/io.js";
import { formatPretty } from "../../util/command/pretty.js";
import { isTransformerKind, TRANSFORMERS_SCOPE, readInstalledTransformerSummaries, resolveTransformersFideDir, type InstalledTransformerSummary, type TransformerKind } from "./shared.js";

export const transformersListCommand = defineCommand({
  surface: "transformers.list",
  command: "fide transformers list",
  outputType: "TransformersListOutput",
  summary: "List installed local Fide transformer blocks and components",
  usage: ["fide transformers list [--kind block|component] [--pretty|-p]"],
  paramOrder: ["kind", "pretty"],
  params: {
    kind: { kind: "string", enum: ["block", "component"], description: "Filter installed transformers by kind", valueLabel: "<kind>" },
    pretty: { kind: "boolean", shorthand: "-p", description: "Human-readable output" },
  },
  examples: ["fide transformers list", "fide transformers list --kind component"],
  notes: ["Lists transformer JSON from the resolved FIDE_DIR/transformers directory."],
});

const TRANSFORMERS_LIST_PARSE_KEYS = mergeBooleanKeySets(booleanKeysFromCommand(transformersListCommand));

export type TransformersListOutput = {
  scope: typeof TRANSFORMERS_SCOPE;
  command: "fide transformers list";
  fideDir: string;
  kind: TransformerKind | null;
  transformers: InstalledTransformerSummary[];
};

export async function runTransformersList(args: string[]): Promise<number> {
  const { flags, positionals } = parseArgs(args, { booleanKeys: TRANSFORMERS_LIST_PARSE_KEYS });
  const useJson = !flags.has("pretty");
  if (flags.has("help")) {
    console.log(renderCommandHelp(transformersListCommand));
    return 0;
  }
  if (positionals.length > 0) throw new Error(`Unexpected arguments: ${positionals.join(" ")}`);

  const kindRaw = getStringFlag(flags, "kind");
  if (flags.has("kind") && kindRaw === null) {
    throw new Error("Missing value for --kind. Expected block or component.");
  }
  if (kindRaw !== null && !isTransformerKind(kindRaw)) {
    throw new Error("Invalid --kind. Expected block or component.");
  }

  const fideDir = resolveTransformersFideDir();
  const payload: TransformersListOutput = {
    scope: TRANSFORMERS_SCOPE,
    command: "fide transformers list",
    fideDir,
    kind: kindRaw,
    transformers: await readInstalledTransformerSummaries(fideDir, kindRaw ?? undefined),
  };

  if (useJson) {
    printJson(payload);
  } else {
    console.log(formatPretty(TRANSFORMERS_SCOPE, payload));
  }
  return 0;
}
