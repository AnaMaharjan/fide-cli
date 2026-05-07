import { parseArgs } from "../../util/command/args.js";
import { booleanKeysFromCommand, defineCommand, mergeBooleanKeySets, renderCommandHelp } from "../../util/command/command-metadata.js";
import { printJson } from "../../util/command/io.js";
import { formatPretty } from "../../util/command/pretty.js";
import {
  listMapFiles,
  MAPS_SCOPE,
  readMapDocument,
  resolveMapKeyPath,
  resolveMapsFideDir,
  validateMapPathConvention,
  type InstalledMapSummary,
  type ValidationIssue,
} from "./shared.js";

export const mapsValidateCommand = defineCommand({
  surface: "maps.validate",
  command: "fide maps validate",
  outputType: "MapsValidateOutput",
  summary: "Validate installed Fide map JSON and component references",
  usage: ["fide maps validate [--pretty|-p]"],
  paramOrder: ["pretty"],
  params: {
    pretty: { kind: "boolean", shorthand: "-p", description: "Human-readable output" },
  },
  examples: ["fide maps validate", "fide maps validate --pretty"],
  notes: [
    "Every installed map must parse as JSON and include version, mapKey, and title.",
    "Every non-builtin uses[].component reference must resolve to an installed component.",
  ],
});

const MAPS_VALIDATE_PARSE_KEYS = mergeBooleanKeySets(booleanKeysFromCommand(mapsValidateCommand));

export type MapsValidateOutput = {
  scope: typeof MAPS_SCOPE;
  command: "fide maps validate";
  fideDir: string;
  valid: boolean;
  maps: InstalledMapSummary[];
  errors: ValidationIssue[];
};

export async function runMapsValidate(args: string[]): Promise<number> {
  const { flags, positionals } = parseArgs(args, { booleanKeys: MAPS_VALIDATE_PARSE_KEYS });
  const useJson = !flags.has("pretty");
  if (flags.has("help")) {
    console.log(renderCommandHelp(mapsValidateCommand));
    return 0;
  }
  if (positionals.length > 0) throw new Error(`Unexpected arguments: ${positionals.join(" ")}`);

  const fideDir = resolveMapsFideDir();
  const files = await listMapFiles(fideDir);
  const maps: InstalledMapSummary[] = [];
  const errors: ValidationIssue[] = [];
  const componentKeys = new Set<string>();
  const componentRefs: Array<{ path: string; component: string }> = [];

  for (const { path, kind } of files) {
    try {
      const document = await readMapDocument(path);
      validateMapPathConvention(fideDir, path, document);
      maps.push({ mapKey: document.mapKey, kind, title: document.title, path });
      if (kind === "component") componentKeys.add(document.mapKey);
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
      const expectedPath = resolveMapKeyPath(fideDir, ref.component);
      errors.push({ path: ref.path, message: `Missing component reference ${ref.component}; expected ${expectedPath}.` });
    } catch (error) {
      errors.push({ path: ref.path, message: error instanceof Error ? error.message : String(error) });
    }
  }

  maps.sort((a, b) => a.mapKey.localeCompare(b.mapKey));
  const payload: MapsValidateOutput = {
    scope: MAPS_SCOPE,
    command: "fide maps validate",
    fideDir,
    valid: errors.length === 0,
    maps,
    errors,
  };

  if (useJson) {
    printJson(payload);
  } else {
    console.log(formatPretty(MAPS_SCOPE, payload));
  }
  return payload.valid ? 0 : 1;
}
