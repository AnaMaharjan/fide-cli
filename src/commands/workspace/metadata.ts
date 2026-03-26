import { commandSchemas, defineCommand } from "../../util/command-metadata.js";

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
    "fide workspace get [--workspace <workspace_id>] [--pretty|-p]",
  ],
  params: [
    { name: "workspace", type: "string", required: false, description: "Workspace public id (`workspace_*`). If omitted, resolve from FIDE_WORKSPACE_ID.", valueLabel: "<workspace_id>" },
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
    "fide workspace members list [--workspace <workspace_id>] [--pretty|-p]",
  ],
  params: [
    { name: "workspace", type: "string", required: false, description: "Workspace public id (`workspace_*`). If omitted, resolve from FIDE_WORKSPACE_ID.", valueLabel: "<workspace_id>" },
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
    "fide workspace members add [--workspace <workspace_id>] (--user-id <user_id> | --human-email <address>) --role <role-key> [--dry-run] [--pretty|-p]",
  ],
  params: [
    { name: "workspace", type: "string", required: false, description: "Workspace public id (`workspace_*`). If omitted, resolve from FIDE_WORKSPACE_ID.", valueLabel: "<workspace_id>" },
    { name: "user-id", type: "string", required: false, description: "User public id to add directly as a member (`user_*`). Mutually exclusive with `--human-email`.", valueLabel: "<user_id>" },
    { name: "human-email", type: "string", required: false, description: "Invite or resolve a human member by email address. Mutually exclusive with `--user-id`.", valueLabel: "<address>" },
    { name: "role", type: "string", required: true, description: "Initial role key for the member being added or invited", valueLabel: "<role-key>" },
    { name: "dry-run", type: "boolean", description: "Validate the membership change and show the intended effect without writing it" },
    { name: "pretty", type: "boolean", shorthand: "-p", description: "Human-readable output" },
  ],
  output: {
    dryRun: "boolean?",
    wouldChange: "boolean?",
    preview: "object?",
    baseUrl: "string",
    source: "string",
    ok: "boolean",
    workspaceId: "string",
    selectorType: "string?",
    resultType: "string?",
    userId: "string?",
    email: "string?",
    addedExistingUser: "boolean?",
    roleKey: "string",
  },
});

export const workspaceRolesGrantCommand = defineCommand({
  surface: "workspace.roles.grant",
  command: "fide workspace roles grant",
  summary: "Grant a role to an existing workspace member",
  usage: [
    "fide workspace roles grant [--workspace <workspace_id>] --user-id <user_id> --role <role-key> [--dry-run] [--pretty|-p]",
  ],
  params: [
    { name: "workspace", type: "string", required: false, description: "Workspace public id (`workspace_*`). If omitted, resolve from FIDE_WORKSPACE_ID.", valueLabel: "<workspace_id>" },
    { name: "user-id", type: "string", required: true, description: "Target workspace member public id (`user_*`).", valueLabel: "<user_id>" },
    { name: "role", type: "string", required: true, description: "Role key to grant", valueLabel: "<role-key>" },
    { name: "dry-run", type: "boolean", description: "Validate the role grant and show the intended effect without writing it" },
    { name: "pretty", type: "boolean", shorthand: "-p", description: "Human-readable output" },
  ],
  output: {
    dryRun: "boolean?",
    wouldChange: "boolean?",
    preview: "object?",
    baseUrl: "string",
    source: "string",
    ok: "boolean",
    workspaceId: "string",
    userId: "string",
    roleKey: "string",
  },
});

export const workspaceRolesRevokeCommand = defineCommand({
  surface: "workspace.roles.revoke",
  command: "fide workspace roles revoke",
  summary: "Revoke a role from an existing workspace member",
  usage: [
    "fide workspace roles revoke [--workspace <workspace_id>] --user-id <user_id> --role <role-key> [--dry-run] [--pretty|-p]",
  ],
  params: [
    { name: "workspace", type: "string", required: false, description: "Workspace public id (`workspace_*`). If omitted, resolve from FIDE_WORKSPACE_ID.", valueLabel: "<workspace_id>" },
    { name: "user-id", type: "string", required: true, description: "Target workspace member public id (`user_*`).", valueLabel: "<user_id>" },
    { name: "role", type: "string", required: true, description: "Role key to revoke", valueLabel: "<role-key>" },
    { name: "dry-run", type: "boolean", description: "Validate the role revoke and show the intended effect without writing it" },
    { name: "pretty", type: "boolean", shorthand: "-p", description: "Human-readable output" },
  ],
  output: {
    dryRun: "boolean?",
    wouldChange: "boolean?",
    preview: "object?",
    baseUrl: "string",
    source: "string",
    ok: "boolean",
    workspaceId: "string",
    userId: "string",
    roleKey: "string",
  },
});

export const WORKSPACE_COMMAND_METADATA = [
  workspaceListCommand,
  workspaceGetCommand,
  workspaceMembersCommand,
  workspaceMembersAddCommand,
  workspaceRolesGrantCommand,
  workspaceRolesRevokeCommand,
] as const;

export const WORKSPACE_COMMAND_SCHEMAS = commandSchemas(WORKSPACE_COMMAND_METADATA);
