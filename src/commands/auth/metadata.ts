import { DEFAULT_FIDE_API_BASE_URL } from "../../util/auth-settings.js";
import { commandSchemas, defineCommand } from "../../util/command-metadata.js";

export const authLoginCommand = defineCommand({
  surface: "login",
  command: "fide login",
  summary: "Save auth for this machine via browser handoff",
  usage: [
    "fide login [--profile <name>] [--set-default] [--api-base-url <url>] [--workspace <workspace_id>] [--agent-name <name>] [--pretty|-p]",
    "fide login --clear-default [--pretty|-p]",
  ],
  params: [
    { name: "api-base-url", type: "string", description: `Fide API base URL. Defaults to ${DEFAULT_FIDE_API_BASE_URL}.`, valueLabel: "<url>" },
    { name: "profile", type: "string", required: false, description: "Named CLI auth/config profile to create or update. Stores hosted credentials and base URL. If omitted, login uses `default`.", valueLabel: "<name>" },
    { name: "set-default", type: "boolean", required: false, description: "Also make this profile the machine default after login." },
    { name: "clear-default", type: "boolean", required: false, description: "Remove the saved default profile without changing any profile auth." },
    { name: "workspace", type: "string", required: false, description: "Preferred workspace public id for browser-based agent login (`workspace_*`).", valueLabel: "<workspace_id>" },
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
    "Login opens the browser to authorize a new workspace-managed agent and stores the returned access token locally.",
    "Login writes auth and workspace context into ~/.fide/profiles/<name>/settings.json.",
    "A default profile is optional. Other commands can resolve auth from --profile, FIDE_PROFILE, or project .fide/settings.json.",
    "Workspace selection can come from --workspace, FIDE_WORKSPACE_ID, project .fide/settings.json, or the selected profile's settings.json.",
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
    { name: "profile", type: "string", required: false, description: "Named CLI auth/config profile to clear. If omitted, resolve from env, project settings, or the default profile.", valueLabel: "<name>" },
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
    { name: "profile", type: "string", required: false, description: "Named CLI auth/config profile to use for hosted requests. Controls credentials and base URL. If omitted, resolve from env, project settings, or the default profile.", valueLabel: "<name>" },
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
