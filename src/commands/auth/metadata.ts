import { DEFAULT_FIDE_API_BASE_URL } from "../../util/auth-settings.js";
import { commandSchemas, defineCommand } from "../../util/command-metadata.js";

export const authLoginCommand = defineCommand({
  surface: "login",
  command: "fide login",
  summary: "Save auth for this machine via browser handoff",
  usage: [
    "fide login [--api-base-url <url>] [--workspace <workspace_id>] [--agent-name <name>] [--pretty|-p]",
  ],
  params: [
    { name: "api-base-url", type: "string", description: `Fide API base URL. Defaults to ${DEFAULT_FIDE_API_BASE_URL}.`, valueLabel: "<url>" },
    { name: "workspace", type: "string", required: false, description: "Preferred workspace public id for browser-based agent login (`workspace_*`).", valueLabel: "<workspace_id>" },
    { name: "agent-name", type: "string", required: false, description: "Suggested agent name for browser-based agent login.", valueLabel: "<name>" },
    { name: "pretty", type: "boolean", shorthand: "-p", description: "Human-readable output" },
  ],
  output: {
    baseUrl: "string?",
    account: "object?",
    source: "string?",
    user: "object?",
    workspace: "object?",
    projectSettingsPath: "string?",
    requestId: "string?",
    loopback: "boolean?",
  },
  notes: [
    "Login opens the browser to authorize a new workspace-managed agent and stores the returned access token locally.",
    "Login writes machine auth into ~/.fide/accounts/<account_id>/settings.json and binds the current project in .fide/settings.json.",
    "API base URL resolution uses --api-base-url, then FIDE_API_BASE_URL, then the default API base URL.",
    "Other commands resolve auth from FIDE_ACCOUNT_ID or project .fide/settings.json.",
    "Workspace selection comes from --workspace, FIDE_WORKSPACE_ID, or project .fide/settings.json.",
  ],
});

export const authLogoutCommand = defineCommand({
  surface: "logout",
  command: "fide logout",
  summary: "Remove saved auth for the selected account",
  usage: [
    "fide logout [--pretty|-p]",
  ],
  params: [
    { name: "pretty", type: "boolean", shorthand: "-p", description: "Human-readable output" },
  ],
  output: {
    cleared: "boolean",
    accountId: "string",
    userSettingsPath: "string",
  },
});

export const authWhoamiCommand = defineCommand({
  surface: "whoami",
  command: "fide whoami",
  summary: "Resolve the current authenticated user through the API",
  usage: [
    "fide whoami [--pretty|-p]",
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

export const AUTH_COMMAND_METADATA = [
  authLoginCommand,
  authLogoutCommand,
  authWhoamiCommand,
] as const;

export const AUTH_COMMAND_SCHEMAS = commandSchemas(AUTH_COMMAND_METADATA);
