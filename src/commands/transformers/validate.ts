import { parseArgs } from "../../util/command/args.js";
import { booleanKeysFromCommand, defineCommand, mergeBooleanKeySets, renderCommandHelp } from "../../util/command/command-metadata.js";
import { printJson } from "../../util/command/io.js";
import { formatPretty } from "../../util/command/pretty.js";
import {
  listTransformerFiles,
  TRANSFORMERS_SCOPE,
  readTransformerDocument,
  resolveTransformerKeyPath,
  resolveTransformersFideDir,
  validateTransformerPathConvention,
  type InstalledTransformerSummary,
  type ValidationIssue,
} from "./shared.js";

export const transformersValidateCommand = defineCommand({
  surface: "transformers.validate",
  command: "fide transformers validate",
  outputType: "TransformersValidateOutput",
  summary: "Validate installed Fide transformer JSON and component references",
  usage: ["fide transformers validate [--pretty|-p]"],
  paramOrder: ["pretty"],
  params: {
    pretty: { kind: "boolean", shorthand: "-p", description: "Human-readable output" },
  },
  examples: ["fide transformers validate", "fide transformers validate --pretty"],
  notes: [
    "Every installed transformer must parse as JSON and include version, transformerKey, and title.",
    "Every non-builtin uses[].component reference must resolve to an installed component.",
  ],
});

const TRANSFORMERS_VALIDATE_PARSE_KEYS = mergeBooleanKeySets(booleanKeysFromCommand(transformersValidateCommand));

export type TransformersValidateOutput = {
  scope: typeof TRANSFORMERS_SCOPE;
  command: "fide transformers validate";
  fideDir: string;
  valid: boolean;
  transformers: InstalledTransformerSummary[];
  errors: ValidationIssue[];
};

export async function runTransformersValidate(args: string[]): Promise<number> {
  const { flags, positionals } = parseArgs(args, { booleanKeys: TRANSFORMERS_VALIDATE_PARSE_KEYS });
  const useJson = !flags.has("pretty");
  if (flags.has("help")) {
    console.log(renderCommandHelp(transformersValidateCommand));
    return 0;
  }
  if (positionals.length > 0) throw new Error(`Unexpected arguments: ${positionals.join(" ")}`);

  const fideDir = resolveTransformersFideDir();
  const files = await listTransformerFiles(fideDir);
  const transformers: InstalledTransformerSummary[] = [];
  const errors: ValidationIssue[] = [];
  const componentKeys = new Set<string>();
  const componentRefs: Array<{ path: string; component: string }> = [];

  for (const { path, kind } of files) {
    try {
      const document = await readTransformerDocument(path);
      validateTransformerPathConvention(fideDir, path, document);
      transformers.push({ transformerKey: document.transformerKey, kind, title: document.title, path });
      if (kind === "component") componentKeys.add(document.transformerKey);
      if (Array.isArray(document.uses)) {
        for (const use of document.uses) {
          if (typeof use.component !== "string") continue;
          if (use.component.startsWith("builtin.")) continue;
          componentRefs.push({ path, component: use.component });
        }
      }
    } catch (error) {
      errors.push({ path, message: error instanceof Error ? error.message : String(error) });
    }
  }

  for (const ref of componentRefs) {
    if (componentKeys.has(ref.component)) continue;
    try {
      const expectedPath = resolveTransformerKeyPath(fideDir, ref.component);
      errors.push({ path: ref.path, message: `Missing component reference ${ref.component}; expected ${expectedPath}.` });
    } catch (error) {
      errors.push({ path: ref.path, message: error instanceof Error ? error.message : String(error) });
    }
  }

  transformers.sort((a, b) => a.transformerKey.localeCompare(b.transformerKey));
  const payload: TransformersValidateOutput = {
    scope: TRANSFORMERS_SCOPE,
    command: "fide transformers validate",
    fideDir,
    valid: errors.length === 0,
    transformers,
    errors,
  };

  if (useJson) {
    printJson(payload);
  } else {
    console.log(formatPretty(TRANSFORMERS_SCOPE, payload));
  }
  return payload.valid ? 0 : 1;
}
