import { DEFAULT_FIDE_BASE_URL } from "../../util/auth-settings.js";
import { commandSchemas, defineCommand } from "../../util/command-metadata.js";

export const authLoginCommand = defineCommand({
  surface: "auth.login",
  command: "fide auth login",
  summary: "Save API-key-based auth for this machine",
  usage: [
    "fide auth login --api-key <key> [--base-url <url>] [--pretty|-p]",
  ],
  params: [
    { name: "base-url", type: "string", description: `Base URL for Fide HTTP surfaces. Defaults to ${DEFAULT_FIDE_BASE_URL}.`, valueLabel: "<url>" },
    { name: "api-key", type: "string", required: true, description: "Fide API key to save locally", valueLabel: "<key>" },
    { name: "pretty", type: "boolean", shorthand: "-p", description: "Human-readable output" },
  ],
  output: {
    baseUrl: "string?",
    source: "string?",
    user: "object?",
  },
  notes: [
    `--base-url defaults to ${DEFAULT_FIDE_BASE_URL}.`,
    "This command verifies the API key with /v1/me before saving it.",
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
    { name: "user-id", type: "string", description: "Optional target user id for workspace-managed service accounts", valueLabel: "<id>" },
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
