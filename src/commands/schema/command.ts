import {
  booleanKeysFromCommand,
  defineCommand,
  mergeBooleanKeySets,
} from "../../util/command/command-metadata.js";

export type SchemaOutput = import("./index.js").SchemaOutput;

export const schemaCommand = defineCommand({
  surface: "schema",
  command: "fide schema",
  outputType: "SchemaOutput",
  summary: "Print command schemas for agents and tooling",
  usage: ["fide schema [--surface <surface>] [--pretty|-p]"],
  paramOrder: ["surface", "pretty"],
  params: {
    surface: { kind: "string", description: "Return one specific schema surface instead of the full index", valueLabel: "<surface>" },
    pretty: { kind: "boolean", shorthand: "-p", description: "Human-readable output" },
  },
  examples: [
    "fide schema",
    "fide schema --surface status",
    "fide schema --surface graph.statement-input",
    "fide schema --surface query.run",
    "fide schema --surface query.save.output",
  ],
  notes: [
    "JSON is the default output. Use --pretty or -p for human-readable output.",
  ],
});

export const SCHEMA_COMMAND_PARSE_KEYS = mergeBooleanKeySets(booleanKeysFromCommand(schemaCommand));
