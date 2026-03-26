import { commandSchemas, defineCommand } from "../../util/command/command-metadata.js";

export const workspaceListCommand = defineCommand({
  surface: "workspace.list",
  command: "fide workspace list",
  summary: "List accessible workspaces",
  usage: [
    "fide workspace list [--pretty|-p]",
  ],
  params: [
    { name: "pretty", type: "boolean", shorthand: "-p", description: "Human-readable output" },
  ],
  output: {
    baseUrl: "string",
    source: "string",
    workspaces: "array",
  },
});

export const workspaceGetCommand = defineCommand({
  surface: "workspace.get",
  command: "fide workspace get",
  summary: "Inspect a workspace by id",
  usage: [
    "fide workspace get [--pretty|-p]",
  ],
  params: [
    { name: "pretty", type: "boolean", shorthand: "-p", description: "Human-readable output" },
  ],
  output: {
    baseUrl: "string",
    source: "string",
    workspace: "object",
  },
});

export const WORKSPACE_COMMAND_METADATA = [
  workspaceListCommand,
  workspaceGetCommand,
] as const;

export const WORKSPACE_COMMAND_SCHEMAS = commandSchemas(WORKSPACE_COMMAND_METADATA);
