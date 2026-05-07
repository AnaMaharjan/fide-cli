import { existsSync } from "node:fs";
import { parseArgs } from "../../util/command/args.js";
import { booleanKeysFromCommand, defineCommand, mergeBooleanKeySets, renderCommandHelp } from "../../util/command/command-metadata.js";
import { printJson } from "../../util/command/io.js";
import { formatPretty } from "../../util/command/pretty.js";
import { kindFromTransformerKey, TRANSFORMERS_SCOPE, readTransformerDocument, resolveTransformerKeyPath, resolveTransformersFideDir, type TransformerDocument, type TransformerKind } from "./shared.js";

export const transformersGetCommand = defineCommand({
  surface: "transformers.get",
  command: "fide transformers get",
  outputType: "TransformersGetOutput",
  summary: "Read one installed Fide transformer block or component",
  usage: ["fide transformers get <transformer-key> [--pretty|-p]"],
  paramOrder: ["pretty"],
  params: {
    pretty: { kind: "boolean", shorthand: "-p", description: "Human-readable output" },
  },
  examples: [
    "fide transformers get blocks.person.social-profile.linkedin",
    "fide transformers get components.identity.named-entity",
  ],
  notes: ["The transformer key determines the expected path under FIDE_DIR/transformers."],
});

const TRANSFORMERS_GET_PARSE_KEYS = mergeBooleanKeySets(booleanKeysFromCommand(transformersGetCommand));

export type TransformersGetOutput = {
  scope: typeof TRANSFORMERS_SCOPE;
  command: "fide transformers get";
  fideDir: string;
  transformerKey: string;
  kind: TransformerKind;
  path: string;
  document: TransformerDocument;
};

export async function runTransformersGet(args: string[]): Promise<number> {
  const { flags, positionals } = parseArgs(args, { booleanKeys: TRANSFORMERS_GET_PARSE_KEYS });
  const useJson = !flags.has("pretty");
  if (flags.has("help")) {
    console.log(renderCommandHelp(transformersGetCommand));
    return 0;
  }

  const transformerKey = positionals[0];
  if (!transformerKey) throw new Error("Missing transformer key.");
  if (positionals.length > 1) throw new Error(`Unexpected extra arguments: ${positionals.slice(1).join(" ")}`);
  const kind = kindFromTransformerKey(transformerKey);
  if (!kind) throw new Error("Transformer key must start with blocks. or components.");

  const fideDir = resolveTransformersFideDir();
  const path = resolveTransformerKeyPath(fideDir, transformerKey);
  if (!existsSync(path)) throw new Error(`Installed transformer not found: ${transformerKey}.`);

  const payload: TransformersGetOutput = {
    scope: TRANSFORMERS_SCOPE,
    command: "fide transformers get",
    fideDir,
    transformerKey,
    kind,
    path,
    document: await readTransformerDocument(path),
  };

  if (useJson) {
    printJson(payload);
  } else {
    console.log(formatPretty(TRANSFORMERS_SCOPE, payload));
  }
  return 0;
}
