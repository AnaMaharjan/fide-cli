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

export const startCommand = defineCommand({
  surface: "start",
  command: "fide start",
  summary: "Start a workspace sync session for this device",
  usage: [
    "fide start [--sync-url <url>] [--workspace <workspace_id>] [--profile <name>] [--pretty|-p]",
  ],
  params: [
    { name: "sync-url", type: "string", description: "Explicit sync websocket URL override", valueLabel: "<wss://.../ws>" },
    { name: "workspace", type: "string", description: "Workspace to attach after connecting", valueLabel: "<workspace_id>" },
    { name: "profile", type: "string", description: "Named CLI auth/config profile to use", valueLabel: "<name>" },
    { name: "pretty", type: "boolean", shorthand: "-p", description: "Human-readable output" },
  ],
  output: {
    connected: "boolean",
    syncUrl: "string",
    workspaceId: "string",
  },
  notes: [
    "Uses saved auth/profile context to derive the sync service URL when --sync-url is omitted.",
    "Connects to /ws, sends hello + attach_workspace, then stays attached until interrupted.",
  ],
});

export const CORE_COMMAND_METADATA = [statusCommand, startCommand] as const;

export const CORE_COMMAND_SCHEMAS = commandSchemas(CORE_COMMAND_METADATA);
