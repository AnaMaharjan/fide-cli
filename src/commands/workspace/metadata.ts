import { commandSchemas, defineCommand } from "../../util/command-metadata.js";

export const workspaceListCommand = defineCommand({
  surface: "workspace.list",
  command: "fide workspace list",
  summary: "List accessible workspaces",
  usage: [
    "fide workspace list [--profile <name>] [--pretty|-p]",
  ],
  params: [
    { name: "profile", type: "string", description: "Profile to use. If omitted, resolve from env, project settings, or the default profile.", valueLabel: "<name>" },
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
    "fide workspace get --workspace <workspace-id> [--profile <name>] [--pretty|-p]",
  ],
  params: [
    { name: "workspace", type: "string", required: true, description: "Workspace id", valueLabel: "<workspace-id>" },
    { name: "profile", type: "string", description: "Profile to use. If omitted, resolve from env, project settings, or the default profile.", valueLabel: "<name>" },
    { name: "pretty", type: "boolean", shorthand: "-p", description: "Human-readable output" },
  ],
  output: {
    baseUrl: "string",
    source: "string",
    workspace: "object",
  },
});

export const workspaceMembersCommand = defineCommand({
  surface: "workspace.members",
  command: "fide workspace members list",
  summary: "List members for a workspace",
  usage: [
    "fide workspace members list --workspace <workspace-id> [--profile <name>] [--pretty|-p]",
  ],
  params: [
    { name: "workspace", type: "string", required: true, description: "Workspace id", valueLabel: "<workspace-id>" },
    { name: "profile", type: "string", description: "Profile to use. If omitted, resolve from env, project settings, or the default profile.", valueLabel: "<name>" },
    { name: "pretty", type: "boolean", shorthand: "-p", description: "Human-readable output" },
  ],
  output: {
    baseUrl: "string",
    source: "string",
    workspaceId: "string",
    members: "array",
  },
});

export const workspaceMembersAddCommand = defineCommand({
  surface: "workspace.members.add",
  command: "fide workspace members add",
  summary: "Add a member to a workspace with an initial role",
  usage: [
    "fide workspace members add --workspace <workspace-id> --user-id <user-id> --role <role-code> [--profile <name>] [--pretty|-p]",
  ],
  params: [
    { name: "workspace", type: "string", required: true, description: "Workspace id", valueLabel: "<workspace-id>" },
    { name: "profile", type: "string", description: "Profile to use. If omitted, resolve from env, project settings, or the default profile.", valueLabel: "<name>" },
    { name: "user-id", type: "string", required: true, description: "User id to add as a member", valueLabel: "<user-id>" },
    { name: "role", type: "string", required: true, description: "Explicit initial role code", valueLabel: "<role-code>" },
    { name: "pretty", type: "boolean", shorthand: "-p", description: "Human-readable output" },
  ],
  output: {
    baseUrl: "string",
    source: "string",
    ok: "boolean",
    workspaceId: "string",
    userId: "string",
    roleCode: "string",
  },
});

export const workspaceRolesGrantCommand = defineCommand({
  surface: "workspace.roles.grant",
  command: "fide workspace roles grant",
  summary: "Grant a role to an existing workspace member",
  usage: [
    "fide workspace roles grant --workspace <workspace-id> --user-id <user-id> --role <role-code> [--profile <name>] [--pretty|-p]",
  ],
  params: [
    { name: "workspace", type: "string", required: true, description: "Workspace id", valueLabel: "<workspace-id>" },
    { name: "profile", type: "string", description: "Profile to use. If omitted, resolve from env, project settings, or the default profile.", valueLabel: "<name>" },
    { name: "user-id", type: "string", required: true, description: "Target workspace member id", valueLabel: "<user-id>" },
    { name: "role", type: "string", required: true, description: "Role code to grant", valueLabel: "<role-code>" },
    { name: "pretty", type: "boolean", shorthand: "-p", description: "Human-readable output" },
  ],
  output: {
    baseUrl: "string",
    source: "string",
    ok: "boolean",
    workspaceId: "string",
    userId: "string",
    roleCode: "string",
  },
});

export const workspaceRolesRevokeCommand = defineCommand({
  surface: "workspace.roles.revoke",
  command: "fide workspace roles revoke",
  summary: "Revoke a role from an existing workspace member",
  usage: [
    "fide workspace roles revoke --workspace <workspace-id> --user-id <user-id> --role <role-code> [--profile <name>] [--pretty|-p]",
  ],
  params: [
    { name: "workspace", type: "string", required: true, description: "Workspace id", valueLabel: "<workspace-id>" },
    { name: "profile", type: "string", description: "Profile to use. If omitted, resolve from env, project settings, or the default profile.", valueLabel: "<name>" },
    { name: "user-id", type: "string", required: true, description: "Target workspace member id", valueLabel: "<user-id>" },
    { name: "role", type: "string", required: true, description: "Role code to revoke", valueLabel: "<role-code>" },
    { name: "pretty", type: "boolean", shorthand: "-p", description: "Human-readable output" },
  ],
  output: {
    baseUrl: "string",
    source: "string",
    ok: "boolean",
    workspaceId: "string",
    userId: "string",
    roleCode: "string",
  },
});

export const workspaceSettingsGetCommand = defineCommand({
  surface: "workspace.settings.get",
  command: "fide workspace settings get",
  summary: "Read workspace-managed settings from the API",
  usage: [
    "fide workspace settings get [--workspace <workspace-id>] [--profile <name>] [--pretty|-p]",
  ],
  params: [
    { name: "workspace", type: "string", description: "Workspace to read. If omitted, resolve from FIDE_WORKSPACE_ID.", valueLabel: "<workspace-id>" },
    { name: "profile", type: "string", description: "Profile to use. If omitted, resolve from env, project settings, or the default profile.", valueLabel: "<name>" },
    { name: "pretty", type: "boolean", shorthand: "-p", description: "Human-readable output" },
  ],
  output: {
    baseUrl: "string",
    source: "string",
    workspaceId: "string",
    workspaceSelectionSource: "string",
    settings: "object",
  },
});

export const workspaceSettingsSetCommand = defineCommand({
  surface: "workspace.settings.set",
  command: "fide workspace settings set",
  summary: "Write workspace-managed settings to the API",
  usage: [
    "fide workspace settings set [--workspace <workspace-id>] [--profile <name>] (--stdin|--file <path>|'<json>') [--pretty|-p]",
  ],
  params: [
    { name: "workspace", type: "string", description: "Workspace to write. If omitted, resolve from FIDE_WORKSPACE_ID.", valueLabel: "<workspace-id>" },
    { name: "profile", type: "string", description: "Profile to use. If omitted, resolve from env, project settings, or the default profile.", valueLabel: "<name>" },
    { name: "stdin", type: "boolean", description: "Read a JSON object from stdin" },
    { name: "file", type: "string", description: "Read a JSON object from a file", valueLabel: "<path>" },
    { name: "pretty", type: "boolean", shorthand: "-p", description: "Human-readable output" },
  ],
  output: {
    baseUrl: "string",
    source: "string",
    workspaceId: "string",
    workspaceSelectionSource: "string",
    settings: "object",
  },
});

export const WORKSPACE_COMMAND_METADATA = [
  workspaceListCommand,
  workspaceGetCommand,
  workspaceMembersCommand,
  workspaceMembersAddCommand,
  workspaceRolesGrantCommand,
  workspaceRolesRevokeCommand,
  workspaceSettingsGetCommand,
  workspaceSettingsSetCommand,
] as const;

export const WORKSPACE_COMMAND_SCHEMAS = commandSchemas(WORKSPACE_COMMAND_METADATA);
