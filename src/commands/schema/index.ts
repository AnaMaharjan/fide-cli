import { parseArgs, shouldUseJsonOutput } from "../../util/args.js";
import { printJson } from "../../util/io.js";
import { COMMAND_SCHEMAS } from "../../util/schemas.js";

const SCHEMAS = COMMAND_SCHEMAS;

function schemaHelp(): string {
  return [
    "Usage:",
    "  fide schema [surface] [--json]",
    "",
    "Surfaces:",
    ...Object.keys(SCHEMAS).map((k) => `  ${k}`),
    "",
    "Examples:",
    "  fide schema",
    "  fide schema graph.add --json",
    "",
    "Agent DX: Use --json for machine-readable schema. Use --help --json on any command for per-command schema.",
    ].join("\n");
}

/**
 * Run `fide schema` — introspect command schemas for agents.
 */
export async function runSchemaCommand(surface: string | undefined, args: string[]): Promise<number> {
  let resolvedSurface = surface;
  let resolvedArgs = args;
  if (resolvedSurface?.startsWith("-")) {
    resolvedArgs = [resolvedSurface, ...args];
    resolvedSurface = undefined;
  }
  const { flags } = parseArgs(resolvedArgs);
  const useJson = shouldUseJsonOutput(flags);

  if (!resolvedSurface || resolvedSurface === "--help" || resolvedSurface === "-h" || resolvedSurface === "help") {
    if (useJson) {
      printJson({ surfaces: Object.keys(SCHEMAS), schemas: SCHEMAS });
    } else {
      console.log(schemaHelp());
    }
    return 0;
  }

  const schema = SCHEMAS[resolvedSurface];
  if (!schema) {
    const payload = { ok: false, error: `Unknown surface: ${resolvedSurface}`, surfaces: Object.keys(SCHEMAS) };
    if (useJson) {
      printJson(payload);
    } else {
      console.error(payload.error);
      console.error("Available surfaces:", Object.keys(SCHEMAS).join(", "));
    }
    return 1;
  }

  if (useJson) {
    printJson(schema);
  } else {
    console.log(JSON.stringify(schema, null, 2));
  }
  return 0;
}
