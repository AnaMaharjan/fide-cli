import { DEFAULT_FIDE_API_BASE_URL } from "../../util/auth-settings.js";
import { commandSchemas, defineCommand } from "../../util/command-metadata.js";

export const authLoginCommand = defineCommand({
  surface: "login",
  command: "fide login",
  summary: "Save auth for this machine via browser handoff or API key",
  usage: [
    "fide login [--web] [--profile <name>] [--set-default] [--api-base-url <url>] [--workspace <id>] [--agent-name <name>] [--pretty|-p]",
    "fide login --api-key <key> [--profile <name>] [--set-default] [--api-base-url <url>] [--pretty|-p]",
    "fide login --clear-default [--pretty|-p]",
  ],
  params: [
    { name: "api-base-url", type: "string", description: `Fide API base URL. Defaults to ${DEFAULT_FIDE_API_BASE_URL}.`, valueLabel: "<url>" },
    { name: "profile", type: "string", required: false, description: "Profile to create or update. If omitted, login uses `default`.", valueLabel: "<name>" },
    { name: "set-default", type: "boolean", required: false, description: "Also make this profile the machine default after login." },
    { name: "clear-default", type: "boolean", required: false, description: "Remove the saved default profile without changing any profile auth." },
    { name: "web", type: "boolean", required: false, description: "Start browser-based agent login. This is the default when --api-key is omitted." },
    { name: "api-key", type: "string", required: false, description: "Save an existing API key instead of using the browser flow.", valueLabel: "<key>" },
    { name: "workspace", type: "string", required: false, description: "Preferred workspace for browser-based agent login.", valueLabel: "<id>" },
    { name: "agent-name", type: "string", required: false, description: "Suggested agent name for browser-based agent login.", valueLabel: "<name>" },
    { name: "pretty", type: "boolean", shorthand: "-p", description: "Human-readable output" },
  ],
  output: {
    baseUrl: "string?",
    profile: "string?",
    source: "string?",
    user: "object?",
    workspaceId: "string?",
    requestId: "string?",
    loopback: "boolean?",
  },
  notes: [
    "Without --api-key, login opens the browser to authorize a new workspace-managed agent and stores the returned API key locally.",
    "Do not combine --web with --api-key.",
    "Login writes auth into ~/.fide/profiles/<name>/auth.json and workspace defaults into ~/.fide/profiles/<name>/settings.json.",
    "A default profile is optional. Other commands can resolve auth from --profile, FIDE_PROFILE, or project .fide/settings.json.",
    "Hosted workspace selection is separate: use --workspace or FIDE_WORKSPACE_ID.",
  ],
});

export const authLogoutCommand = defineCommand({
  surface: "logout",
  command: "fide logout",
  summary: "Remove saved auth for the selected profile",
  usage: [
    "fide logout [--profile <name>] [--pretty|-p]",
  ],
  params: [
    { name: "profile", type: "string", required: false, description: "Profile to clear. If omitted, resolve from env, project settings, or the default profile.", valueLabel: "<name>" },
    { name: "pretty", type: "boolean", shorthand: "-p", description: "Human-readable output" },
  ],
  output: {
    cleared: "boolean",
    profile: "string",
    userSettingsPath: "string",
  },
});

export const authWhoamiCommand = defineCommand({
  surface: "whoami",
  command: "fide whoami",
  summary: "Resolve the current authenticated user through the API",
  usage: [
    "fide whoami [--profile <name>] [--pretty|-p]",
  ],
  params: [
    { name: "profile", type: "string", required: false, description: "Profile to use. If omitted, resolve from env, project settings, or the default profile.", valueLabel: "<name>" },
    { name: "pretty", type: "boolean", shorthand: "-p", description: "Human-readable output" },
  ],
  output: {
    baseUrl: "string",
    source: "string",
    user: "object",
  },
});

export const authKeysListCommand = defineCommand({
  surface: "keys.list",
  command: "fide keys list",
  summary: "List API keys visible to the current authenticated user",
  usage: [
    "fide keys list [--profile <name>] [--pretty|-p]",
  ],
  params: [
    { name: "profile", type: "string", required: false, description: "Profile to use. If omitted, resolve from env, project settings, or the default profile.", valueLabel: "<name>" },
    { name: "pretty", type: "boolean", shorthand: "-p", description: "Human-readable output" },
  ],
  output: {
    baseUrl: "string",
    source: "string",
    apiKeys: "array",
  },
});

export const authKeysCreateCommand = defineCommand({
  surface: "keys.create",
  command: "fide keys create",
  summary: "Create an API key",
  usage: [
    "fide keys create --label <label> [--profile <name>] [--user-id <id>] [--expires-at <iso8601>] [--pretty|-p]",
  ],
  params: [
    { name: "label", type: "string", required: true, description: "Label for the new API key", valueLabel: "<label>" },
    { name: "profile", type: "string", required: false, description: "Profile to use. If omitted, resolve from env, project settings, or the default profile.", valueLabel: "<name>" },
    { name: "user-id", type: "string", description: "Optional target agent user id", valueLabel: "<id>" },
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
  surface: "keys.revoke",
  command: "fide keys revoke",
  summary: "Revoke an API key by id",
  usage: [
    "fide keys revoke <id> [--profile <name>] [--pretty|-p]",
  ],
  params: [
    { name: "profile", type: "string", required: false, description: "Profile to use. If omitted, resolve from env, project settings, or the default profile.", valueLabel: "<name>" },
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
  authWhoamiCommand,
  authKeysListCommand,
  authKeysCreateCommand,
  authKeysRevokeCommand,
] as const;

export const AUTH_COMMAND_SCHEMAS = commandSchemas(AUTH_COMMAND_METADATA);
