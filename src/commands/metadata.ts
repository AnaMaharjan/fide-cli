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
    "fide start [--sync-url <url>] [--workspace <workspace_id>] [--pretty|-p]",
  ],
  params: [
    { name: "sync-url", type: "string", description: "Explicit sync URL override. Accepts ws(s)://.../ws or http(s):// base URLs.", valueLabel: "<url>" },
    { name: "workspace", type: "string", description: "Workspace to attach after connecting", valueLabel: "<workspace_id>" },
    { name: "pretty", type: "boolean", shorthand: "-p", description: "Human-readable output" },
  ],
  output: {
    started: "boolean",
    alreadyRunning: "boolean?",
    pid: "number?",
    syncUrl: "string",
    workspaceId: "string",
  },
  notes: [
    "Sync URL resolution order: --sync-url, FIDE_SYNC_BASE_URL, then derived from the resolved API base URL.",
    "API base URL resolution uses --api-base-url where supported, then FIDE_API_BASE_URL, then the default API base URL.",
    "Workspace targeting resolves from --workspace, FIDE_WORKSPACE_ID, or project .fide/settings.json.",
    "Starts a detached local sync agent and returns immediately.",
  ],
});

export const stopCommand = defineCommand({
  surface: "stop",
  command: "fide stop",
  summary: "Stop the background workspace sync session for this device",
  usage: [
    "fide stop [--pretty|-p]",
  ],
  params: [
    { name: "pretty", type: "boolean", shorthand: "-p", description: "Human-readable output" },
  ],
  output: {
    stopped: "boolean",
    pid: "number?",
    workspaceId: "string?",
  },
  notes: [
    "Stops the detached local sync agent started by `fide start`.",
  ],
});

export const CORE_COMMAND_METADATA = [statusCommand, startCommand, stopCommand] as const;

export const CORE_COMMAND_SCHEMAS = commandSchemas(CORE_COMMAND_METADATA);
