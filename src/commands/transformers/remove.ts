import { parseArgs } from "../../util/command/args.js";
import { booleanKeysFromCommand, defineCommand, mergeBooleanKeySets, renderCommandHelp } from "../../util/command/command-metadata.js";
import { printJson } from "../../util/command/io.js";
import { formatPretty } from "../../util/command/pretty.js";
import { postDaemonTransformersRemove } from "../../util/daemon/daemon-http.js";
import {
  kindFromTransformerKey,
  TRANSFORMERS_SCOPE,
  resolveTransformerKeyPath,
  resolveTransformersFideDir,
  type TransformerKind,
} from "./shared.js";

export const transformersRemoveCommand = defineCommand({
  surface: "transformers.remove",
  command: "fide transformers remove",
  outputType: "TransformersRemoveOutput",
  summary: "Remove one installed Fide transformer block or component",
  usage: ["fide transformers remove <transformer-key> [--pretty|-p]"],
  paramOrder: ["pretty"],
  params: {
    pretty: { kind: "boolean", shorthand: "-p", description: "Human-readable output" },
  },
  examples: ["fide transformers remove blocks.person.social-profile.linkedin"],
  notes: ["The transformer key determines the path removed under FIDE_DIR/transformers."],
});

const TRANSFORMERS_REMOVE_PARSE_KEYS = mergeBooleanKeySets(booleanKeysFromCommand(transformersRemoveCommand));

export type TransformersRemoveOutput = {
  scope: typeof TRANSFORMERS_SCOPE;
  command: "fide transformers remove";
  fideDir: string;
  transformerKey: string;
  kind: TransformerKind;
  path: string;
  removed: boolean;
};

export async function runTransformersRemove(args: string[]): Promise<number> {
  const { flags, positionals } = parseArgs(args, { booleanKeys: TRANSFORMERS_REMOVE_PARSE_KEYS });
  const useJson = !flags.has("pretty");
  if (flags.has("help")) {
    console.log(renderCommandHelp(transformersRemoveCommand));
    return 0;
  }

  const transformerKey = positionals[0];
  if (!transformerKey) throw new Error("Missing transformer key.");
  if (positionals.length > 1) throw new Error(`Unexpected extra arguments: ${positionals.slice(1).join(" ")}`);
  const kind = kindFromTransformerKey(transformerKey);
  if (!kind) throw new Error("Transformer key must start with blocks. or components.");

  const fideDir = resolveTransformersFideDir();
  const path = resolveTransformerKeyPath(fideDir, transformerKey);
  await postDaemonTransformersRemove(transformerKey);
  const payload: TransformersRemoveOutput = {
    scope: TRANSFORMERS_SCOPE,
    command: "fide transformers remove",
    fideDir,
    transformerKey,
    kind,
    path,
    removed: true,
  };

  if (useJson) {
    printJson(payload);
  } else {
    console.log(formatPretty(TRANSFORMERS_SCOPE, payload));
  }
  return 0;
}
