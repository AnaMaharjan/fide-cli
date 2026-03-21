import { commandSchemas, defineCommand } from "../util/command-metadata.js";

export const statusCommand = defineCommand({
  surface: "status",
  command: "fide status",
  summary: "Show active machine, project, and workspace context",
  usage: [
    "fide status [--pretty|-p]",
  ],
  params: [
    { name: "pretty", type: "boolean", shorthand: "-p", description: "Human-readable output" },
  ],
  output: {
    machine: "object",
    project: "object",
    workspace: "object",
  },
  notes: [
    "Shows active machine, project, and workspace context in one response.",
  ],
});

export const CORE_COMMAND_METADATA = [statusCommand] as const;

export const CORE_COMMAND_SCHEMAS = commandSchemas(CORE_COMMAND_METADATA);
