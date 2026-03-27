import { parseArgs, shouldUseJsonOutput } from "../../util/command/args.js";
import { renderCommandHelp } from "../../util/command/command-metadata.js";
import { renderHelp } from "../../util/command/help/index.js";
import { printJson } from "../../util/command/io.js";
import { formatPretty } from "../../util/command/pretty.js";
import { errorResponse, okResponse } from "../../util/command/response.js";
import { buildSchemaIndexPayload, UNIFIED_SCHEMAS } from "../../util/command/schemas.js";
import { SCHEMA_COMMAND_PARSE_KEYS, schemaCommand } from "./command.js";

export type SchemaIndexOutput = {
  ok: true;
  scope: "schema-index.v1";
  command: "fide schema";
  surfaces: string[];
  schemas: Record<string, unknown>;
  next: string;
};

export type SchemaSurfaceOutput = {
  ok: true;
  scope: "schema-surface.v1";
  command: "fide schema";
  surface: string;
  schema: unknown;
  next: string;
};

export type SchemaOutput = SchemaIndexOutput | SchemaSurfaceOutput;

function schemaCommandHelpText(): string {
  const { surfaces } = buildSchemaIndexPayload();
  const surfaceSection = renderHelp({
    sections: [
      {
        title: "Surfaces",
        items: surfaces.map((k) => `  ${k}`),
      },
    ],
  });
  return [renderCommandHelp(schemaCommand), "", surfaceSection].join("\n");
}

/**
 * Run `fide schema` — introspect command schemas for agents.
 */
export async function runSchemaCommand(args: string[]): Promise<number> {
  const { flags } = parseArgs(args, { booleanKeys: SCHEMA_COMMAND_PARSE_KEYS });
  const useJson = shouldUseJsonOutput(flags);
  const explicitHelp = flags.has("help");
  const resolvedSurface = typeof flags.get("surface") === "string" ? String(flags.get("surface")) : undefined;

  if (!resolvedSurface || explicitHelp) {
    if (explicitHelp) {
      console.log(schemaCommandHelpText());
    } else if (useJson) {
      printJson(okResponse("schema-index.v1", {
        ...buildSchemaIndexPayload(),
        next: "fide schema --surface <surface>",
      }, {
        command: "fide schema",
      }));
    } else {
      console.log(schemaCommandHelpText());
    }
    return 0;
  }

  const { surfaces } = buildSchemaIndexPayload();
  const schemaEntry = UNIFIED_SCHEMAS[resolvedSurface];
  if (!schemaEntry) {
    const payload = errorResponse("schema-index.v1", `Unknown surface: ${resolvedSurface}`, {
      surfaces,
    }, {
      command: "fide schema",
    });
    if (useJson) {
      printJson(payload);
    } else {
      console.error(payload.error);
      console.error("Available surfaces:", surfaces.join(", "));
    }
    return 1;
  }

  if (useJson) {
    printJson(okResponse("schema-surface.v1", {
      surface: resolvedSurface,
      schema: schemaEntry,
      next: "fide schema",
    }, {
      command: "fide schema",
    }));
  } else {
    console.log(formatPretty("schema-surface.v1", okResponse("schema-surface.v1", {
      surface: resolvedSurface,
      schema: schemaEntry,
      next: "fide schema",
    }, {
      command: "fide schema",
    })));
  }
  return 0;
}
