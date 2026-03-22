import { DEFAULT_FIDE_API_BASE_URL } from "../../util/auth-settings.js";
import { commandSchemas, defineCommand } from "../../util/command-metadata.js";

export const authLoginCommand = defineCommand({
  surface: "auth.login",
  command: "fide auth login",
  summary: "Save auth for this machine via browser handoff or API key",
  usage: [
    "fide auth login [--web] [--api-base-url <url>] [--workspace <id>] [--agent-name <name>] [--pretty|-p]",
    "fide auth login --api-key <key> [--api-base-url <url>] [--pretty|-p]",
  ],
  params: [
    { name: "api-base-url", type: "string", description: `API base URL for Fide HTTP surfaces. Defaults to ${DEFAULT_FIDE_API_BASE_URL}.`, valueLabel: "<url>" },
    { name: "web", type: "boolean", required: false, description: "Use browser-based agent auth handoff. This is also the default when --api-key is omitted." },
    { name: "api-key", type: "string", required: false, description: "Fide API key to save locally for non-interactive machine auth.", valueLabel: "<key>" },
    { name: "workspace", type: "string", required: false, description: "Optional preferred workspace for browser-based agent auth", valueLabel: "<id>" },
    { name: "agent-name", type: "string", required: false, description: "Optional suggested agent name for browser-based agent auth", valueLabel: "<name>" },
    { name: "pretty", type: "boolean", shorthand: "-p", description: "Human-readable output" },
  ],
  output: {
    baseUrl: "string?",
    source: "string?",
    user: "object?",
    workspaceId: "string?",
    requestId: "string?",
    loopback: "boolean?",
  },
  notes: [
    `--api-base-url defaults to ${DEFAULT_FIDE_API_BASE_URL}.`,
    "With no mode flags, this command starts browser-based agent auth.",
    "--web explicitly starts browser-based agent auth.",
    "With --api-key, this command verifies the key with /v1/me before saving it.",
    "Without --api-key, this command opens the browser to authorize a new workspace-managed agent and stores the returned API key locally.",
    "--agent-name pre-fills the proposed agent name in the browser approval flow.",
    "During browser-based login, the CLI prints the handoff URL immediately and waits for browser login. Press Ctrl+C to cancel.",
    "Do not combine --web with --api-key.",
    "The saved settings are local to this machine.",
  ],
});

export const authLogoutCommand = defineCommand({
  surface: "auth.logout",
  command: "fide auth logout",
  summary: "Remove saved machine-level auth settings",
  usage: [
    "fide auth logout [--pretty|-p]",
  ],
  params: [
    { name: "pretty", type: "boolean", shorthand: "-p", description: "Human-readable output" },
  ],
  output: {
    cleared: "boolean",
    userSettingsPath: "string",
  },
});

export const authStatusCommand = defineCommand({
  surface: "auth.status",
  command: "fide auth status",
  summary: "Inspect machine-level auth settings and remote validity",
  usage: [
    "fide auth status [--pretty|-p]",
  ],
  params: [
    { name: "pretty", type: "boolean", shorthand: "-p", description: "Human-readable output" },
  ],
  output: {
    configured: "boolean",
    baseUrl: "string?",
    source: "string?",
    userSettingsPath: "string",
    storedSettingsPresent: "boolean",
    envConfigured: "boolean",
    remote: "object<{ ok: boolean, error?: string }>",
  },
});

export const authWhoamiCommand = defineCommand({
  surface: "auth.whoami",
  command: "fide auth whoami",
  summary: "Resolve the current authenticated user through the API",
  usage: [
    "fide auth whoami [--pretty|-p]",
  ],
  params: [
    { name: "pretty", type: "boolean", shorthand: "-p", description: "Human-readable output" },
  ],
  output: {
    baseUrl: "string",
    source: "string",
    user: "object",
  },
});

export const authKeysListCommand = defineCommand({
  surface: "auth.keys.list",
  command: "fide auth keys list",
  summary: "List API keys visible to the current authenticated user",
  usage: [
    "fide auth keys list [--pretty|-p]",
  ],
  params: [
    { name: "pretty", type: "boolean", shorthand: "-p", description: "Human-readable output" },
  ],
  output: {
    baseUrl: "string",
    source: "string",
    apiKeys: "array",
  },
});

export const authKeysCreateCommand = defineCommand({
  surface: "auth.keys.create",
  command: "fide auth keys create",
  summary: "Create an API key",
  usage: [
    "fide auth keys create --label <label> [--user-id <id>] [--expires-at <iso8601>] [--pretty|-p]",
  ],
  params: [
    { name: "label", type: "string", required: true, description: "Label for the new API key", valueLabel: "<label>" },
    { name: "user-id", type: "string", description: "Optional target user id for workspace-managed agents", valueLabel: "<id>" },
    { name: "expires-at", type: "string", description: "Optional ISO-8601 expiration timestamp", valueLabel: "<iso8601>" },
    { name: "pretty", type: "boolean", shorthand: "-p", description: "Human-readable output" },
  ],
  output: {
    baseUrl: "string",
    source: "string",
    apiKey: "object",
    rawKey: "string",
  },
});

export const authKeysRevokeCommand = defineCommand({
  surface: "auth.keys.revoke",
  command: "fide auth keys revoke",
  summary: "Revoke an API key by id",
  usage: [
    "fide auth keys revoke <id> [--pretty|-p]",
  ],
  params: [
    { name: "pretty", type: "boolean", shorthand: "-p", description: "Human-readable output" },
  ],
  output: {
    baseUrl: "string",
    source: "string",
    id: "string",
    ok: "boolean",
  },
});

export const AUTH_COMMAND_METADATA = [
  authLoginCommand,
  authLogoutCommand,
  authStatusCommand,
  authWhoamiCommand,
  authKeysListCommand,
  authKeysCreateCommand,
  authKeysRevokeCommand,
] as const;

export const AUTH_COMMAND_SCHEMAS = commandSchemas(AUTH_COMMAND_METADATA);
