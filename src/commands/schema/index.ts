import { parseArgs, shouldUseJsonOutput } from "../../util/args.js";
import { renderHelp } from "../../util/help.js";
import { printJson } from "../../util/io.js";
import { errorResponse, okResponse } from "../../util/response.js";
import { COMMAND_SCHEMAS, EXTENDED_SCHEMAS } from "../../util/schemas.js";

const SCHEMAS = COMMAND_SCHEMAS;

function schemaHelp(): string {
  return renderHelp({
    sections: [
      {
        title: "Usage",
        items: [
          "  fide schema [surface] [--pretty|-p]",
        ],
      },
      {
        title: "Examples",
        items: [
          "  fide schema",
          "  fide schema graph.write",
          "  fide schema graph.sql",
        ],
      },
      {
        title: "Notes",
        items: [
          "  - JSON is the default output. Use --pretty or -p for human-readable output.",
        ],
      },
      {
        title: "Surfaces",
        items: Object.keys(SCHEMAS).map((k) => `  ${k}`),
      },
    ],
  });
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
  const explicitHelp = resolvedSurface === "--help" || resolvedSurface === "-h" || resolvedSurface === "help"
    || flags.has("help");

  if (!resolvedSurface || explicitHelp) {
    if (explicitHelp) {
      console.log(schemaHelp());
    } else if (useJson) {
      printJson(okResponse("schema-index.v1", {
        surfaces: Object.keys(SCHEMAS),
        schemas: SCHEMAS,
      }, {
        command: "fide schema",
      }));
    } else {
      console.log(schemaHelp());
    }
    return 0;
  }

  const schema = SCHEMAS[resolvedSurface];
  const extendedSchema = (EXTENDED_SCHEMAS as Record<string, unknown>)[resolvedSurface];
  if (!schema && !extendedSchema) {
    const payload = errorResponse("schema-index.v1", `Unknown surface: ${resolvedSurface}`, {
      surfaces: Object.keys(SCHEMAS),
    }, {
      command: "fide schema",
    });
    if (useJson) {
      printJson(payload);
    } else {
      console.error(payload.error);
      console.error("Available surfaces:", Object.keys(SCHEMAS).join(", "));
    }
    return 1;
  }

  if (extendedSchema) {
    printJson(okResponse("schema-surface.v1", {
      surface: resolvedSurface,
      schema: extendedSchema,
    }, {
      command: "fide schema",
    }));
    return 0;
  }

  if (!schema) {
    const payload = errorResponse("schema-index.v1", `Unknown surface: ${resolvedSurface}`, {
      surfaces: Object.keys(SCHEMAS),
    }, {
      command: "fide schema",
    });
    if (useJson) {
      printJson(payload);
    } else {
      console.error(payload.error);
      console.error("Available surfaces:", Object.keys(SCHEMAS).join(", "));
    }
    return 1;
  }

  if (useJson) {
    printJson(okResponse("schema-surface.v1", {
      surface: resolvedSurface,
      schema,
    }, {
      command: "fide schema",
    }));
  } else {
    console.log(JSON.stringify(schema, null, 2));
  }
  return 0;
}
