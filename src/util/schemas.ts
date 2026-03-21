import { FIDE_ENTITY_TYPES } from "@chris-test/graph";
import { GRAPH_COMMAND_SCHEMAS } from "../commands/graph/metadata.js";

/**
 * Machine-readable command schemas for agent introspection.
 * Used by `fide schema` and by `--help --json` on individual commands.
 */
const FIDE_ENTITY_TYPE_ENUM = Object.keys(FIDE_ENTITY_TYPES).sort();

export const COMMAND_SCHEMAS: Record<string, { command: string; params: Array<{ name: string; type: string; required?: boolean; description?: string; enum?: string[] }>; output: Record<string, string> }> = {
  ...GRAPH_COMMAND_SCHEMAS,
  status: {
    command: "fide status",
    params: [
      { name: "pretty", type: "boolean", required: false, description: "Human-readable output" },
    ],
    output: {
      machine: "object",
      project: "object",
      workspace: "object",
    },
  },
  "graph.write": {
    command: "fide graph write",
    params: [
      { name: "fide-dir", type: "string", required: false, description: "Local .fide directory override" },
      { name: "stdin", type: "boolean", required: false, description: "Primary agent path: read statement inputs from stdin" },
      { name: "file", type: "string", required: false, description: "Primary agent path: input file path" },
      { name: "format", type: "string", required: false, enum: ["json", "jsonl", "fsd"] },
      { name: "no-normalize", type: "boolean", required: false },
      { name: "pretty", type: "boolean", required: false, description: "Human-readable output" },
    ],
    output: {
      root: "string",
      statementCount: "number",
      mode: "string",
      outPath: "string",
      warnings: "string[]",
    },
  },
  "auth.login": {
    command: "fide auth login",
    params: [
      { name: "base-url", type: "string", required: false, description: "Base URL for Fide HTTP surfaces. Defaults to https://api.fide.work." },
      { name: "api-key", type: "string", required: true, description: "Fide API key to save locally" },
      { name: "pretty", type: "boolean", required: false, description: "Human-readable output" },
    ],
    output: {
      baseUrl: "string?",
      source: "string?",
      user: "object?",
    },
  },
  "auth.logout": {
    command: "fide auth logout",
    params: [
      { name: "pretty", type: "boolean", required: false, description: "Human-readable output" },
    ],
    output: {
      cleared: "boolean",
      userSettingsPath: "string",
    },
  },
  "auth.status": {
    command: "fide auth status",
    params: [
      { name: "pretty", type: "boolean", required: false, description: "Human-readable output" },
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
  },
  "auth.whoami": {
    command: "fide auth whoami",
    params: [
      { name: "pretty", type: "boolean", required: false, description: "Human-readable output" },
    ],
    output: {
      baseUrl: "string",
      source: "string",
      user: "object",
    },
  },
  "auth.keys.list": {
    command: "fide auth keys list",
    params: [
      { name: "pretty", type: "boolean", required: false, description: "Human-readable output" },
    ],
    output: {
      baseUrl: "string",
      source: "string",
      apiKeys: "array",
    },
  },
  "auth.keys.create": {
    command: "fide auth keys create",
    params: [
      { name: "label", type: "string", required: true, description: "Label for the new API key" },
      { name: "user-id", type: "string", required: false, description: "Optional target user id for workspace-managed service accounts" },
      { name: "expires-at", type: "string", required: false, description: "Optional ISO-8601 expiration timestamp" },
      { name: "pretty", type: "boolean", required: false, description: "Human-readable output" },
    ],
    output: {
      baseUrl: "string",
      source: "string",
      apiKey: "object",
      rawKey: "string",
    },
  },
  "auth.keys.revoke": {
    command: "fide auth keys revoke",
    params: [
      { name: "id", type: "string", required: true, description: "API key id to revoke" },
      { name: "pretty", type: "boolean", required: false, description: "Human-readable output" },
    ],
    output: {
      baseUrl: "string",
      source: "string",
      id: "string",
      ok: "boolean",
    },
  },
  "workspace.list": {
    command: "fide workspace list",
    params: [
      { name: "pretty", type: "boolean", required: false, description: "Human-readable output" },
    ],
    output: {
      baseUrl: "string",
      source: "string",
      workspaces: "array",
    },
  },
  "workspace.get": {
    command: "fide workspace get",
    params: [
      { name: "workspace", type: "string", required: true, description: "Workspace id" },
      { name: "pretty", type: "boolean", required: false, description: "Human-readable output" },
    ],
    output: {
      baseUrl: "string",
      source: "string",
      workspace: "object",
    },
  },
  "workspace.members": {
    command: "fide workspace members",
    params: [
      { name: "workspace", type: "string", required: true, description: "Workspace id" },
      { name: "pretty", type: "boolean", required: false, description: "Human-readable output" },
    ],
    output: {
      baseUrl: "string",
      source: "string",
      workspaceId: "string",
      members: "array",
    },
  },
  "workspace.members.add": {
    command: "fide workspace members add",
    params: [
      { name: "workspace", type: "string", required: true, description: "Workspace id" },
      { name: "user-id", type: "string", required: true, description: "User id to add as a member" },
      { name: "role", type: "string", required: true, description: "Explicit initial role code" },
      { name: "pretty", type: "boolean", required: false, description: "Human-readable output" },
    ],
    output: {
      baseUrl: "string",
      source: "string",
      ok: "boolean",
      workspaceId: "string",
      userId: "string",
      roleCode: "string",
    },
  },
  "workspace.roles.grant": {
    command: "fide workspace roles grant",
    params: [
      { name: "workspace", type: "string", required: true, description: "Workspace id" },
      { name: "user-id", type: "string", required: true, description: "Target workspace member id" },
      { name: "role", type: "string", required: true, description: "Role code to grant" },
      { name: "pretty", type: "boolean", required: false, description: "Human-readable output" },
    ],
    output: {
      baseUrl: "string",
      source: "string",
      ok: "boolean",
      workspaceId: "string",
      userId: "string",
      roleCode: "string",
    },
  },
  "workspace.roles.revoke": {
    command: "fide workspace roles revoke",
    params: [
      { name: "workspace", type: "string", required: true, description: "Workspace id" },
      { name: "user-id", type: "string", required: true, description: "Target workspace member id" },
      { name: "role", type: "string", required: true, description: "Role code to revoke" },
      { name: "pretty", type: "boolean", required: false, description: "Human-readable output" },
    ],
    output: {
      baseUrl: "string",
      source: "string",
      ok: "boolean",
      workspaceId: "string",
      userId: "string",
      roleCode: "string",
    },
  },
  "workspace.service-accounts.create": {
    command: "fide workspace service-accounts create",
    params: [
      { name: "workspace", type: "string", required: true, description: "Workspace id" },
      { name: "label", type: "string", required: true, description: "Service-account label" },
      { name: "role", type: "string", required: true, description: "Initial role code for the new service account" },
      { name: "pretty", type: "boolean", required: false, description: "Human-readable output" },
    ],
    output: {
      baseUrl: "string",
      source: "string",
      serviceAccount: "object",
    },
  },
  "workspace.settings.get": {
    command: "fide workspace settings get",
    params: [
      { name: "workspace", type: "string", required: false, description: "Explicit workspace selection. Falls back to FIDE_WORKSPACE or saved settings." },
      { name: "pretty", type: "boolean", required: false, description: "Human-readable output" },
    ],
    output: {
      baseUrl: "string",
      source: "string",
      workspaceId: "string",
      workspaceSelectionSource: "string",
      settings: "object",
    },
  },
  "workspace.settings.set": {
    command: "fide workspace settings set",
    params: [
      { name: "workspace", type: "string", required: false, description: "Explicit workspace selection. Falls back to FIDE_WORKSPACE or saved settings." },
      { name: "stdin", type: "boolean", required: false, description: "Read a JSON object from stdin" },
      { name: "file", type: "string", required: false, description: "Read a JSON object from a file" },
      { name: "pretty", type: "boolean", required: false, description: "Human-readable output" },
    ],
    output: {
      baseUrl: "string",
      source: "string",
      workspaceId: "string",
      workspaceSelectionSource: "string",
      settings: "object",
    },
  },
  "workspace.connections.list": {
    command: "fide workspace connections list",
    params: [
      { name: "workspace", type: "string", required: false, description: "Explicit workspace selection. Falls back to FIDE_WORKSPACE or saved settings." },
      { name: "pretty", type: "boolean", required: false, description: "Human-readable output" },
    ],
    output: {
      baseUrl: "string",
      source: "string",
      workspaceId: "string",
      workspaceSelectionSource: "string",
      connections: "array",
    },
  },
  "workspace.connections.create": {
    command: "fide workspace connections create",
    params: [
      { name: "workspace", type: "string", required: false, description: "Explicit workspace selection. Falls back to FIDE_WORKSPACE or saved settings." },
      { name: "slug", type: "string", required: true, description: "Stable workspace-local connection name" },
      { name: "kind", type: "string", required: true, description: "Connection kind, such as postgres" },
      { name: "connection", type: "string", required: false, description: "Raw connection secret to store in Vault server-side" },
      { name: "secret-id", type: "string", required: false, description: "Existing Vault secret UUID or external secret backend id" },
      { name: "description", type: "string", required: false, description: "Optional connection description" },
      { name: "pretty", type: "boolean", required: false, description: "Human-readable output" },
    ],
    output: {
      baseUrl: "string",
      source: "string",
      workspaceId: "string",
      workspaceSelectionSource: "string",
      connection: "object",
    },
  },
  "workspace.queries.list": {
    command: "fide workspace queries list",
    params: [
      { name: "workspace", type: "string", required: false, description: "Explicit workspace selection. Falls back to FIDE_WORKSPACE or saved settings." },
      { name: "query-store", type: "string", required: false, description: "Hosted query store key when a workspace has more than one query store configured." },
      { name: "pretty", type: "boolean", required: false, description: "Human-readable output" },
    ],
    output: {
      baseUrl: "string",
      source: "string",
      workspaceId: "string",
      workspaceSelectionSource: "string",
      queryStoreKey: "string",
      queries: "array",
      next: "object?",
    },
  },
  "workspace.query.get": {
    command: "fide workspace queries get",
    params: [
      { name: "workspace", type: "string", required: false, description: "Explicit workspace selection. Falls back to FIDE_WORKSPACE or saved settings." },
      { name: "graph", type: "string", required: true, description: "Graph key referenced by the saved query" },
      { name: "name", type: "string", required: true, description: "Saved query name" },
      { name: "query-store", type: "string", required: false, description: "Hosted query store key when a workspace has more than one query store configured." },
      { name: "pretty", type: "boolean", required: false, description: "Human-readable output" },
    ],
    output: {
      baseUrl: "string",
      source: "string",
      workspaceId: "string",
      workspaceSelectionSource: "string",
      query: "object",
      next: "object",
    },
  },
  "workspace.query.run": {
    command: "fide workspace queries run",
    params: [
      { name: "workspace", type: "string", required: true, description: "Explicit workspace selection. Falls back to FIDE_WORKSPACE or saved settings." },
      { name: "graph", type: "string", required: true, description: "Graph key referenced by the saved query" },
      { name: "name", type: "string", required: true, description: "Saved query name" },
      { name: "query-store", type: "string", required: false, description: "Hosted query store key when a workspace has more than one query store configured." },
      { name: "limit", type: "number", required: false, description: "Maximum number of rows to return, capped server-side." },
      { name: "pretty", type: "boolean", required: false, description: "Human-readable output" },
    ],
    output: {
      baseUrl: "string",
      source: "string",
      workspaceId: "string",
      workspaceSelectionSource: "string",
      result: "object",
      next: "object",
    },
  },
  "graph.statement-input": {
    command: "fide schema graph.statement-input",
    params: [],
    output: {
      format: "string",
      rootType: "string",
      required: "string[]",
      subjectEntityTypeEnum: "string[]",
      subjectReferenceTypeEnum: "string[]",
      predicateEntityTypeEnum: "string[]",
      predicateReferenceTypeEnum: "string[]",
      objectEntityTypeEnum: "string[]",
      objectReferenceTypeEnum: "string[]",
      policyNotes: "string[]",
    },
  },
  "graph.defs": {
    command: "fide graph defs",
    params: [
      { name: "entity", type: "string", required: false, description: "Optional entity type filter (e.g. Person, NetworkResource)" },
    ],
    output: {
      ok: "boolean",
      command: "string",
      scope: "string",
      layers: "object",
      statementRules: "array",
      entity: "object?",
      entities: "array?",
    },
  },
};

export const EXTENDED_SCHEMAS = {
  "graph.statement-input": {
    command: "fide schema graph.statement-input",
    format: "fcp.statement-input.v0",
    rootType: "array",
    required: ["subject", "predicate", "object"],
    item: {
      type: "object",
      required: ["subject", "predicate", "object"],
      properties: {
        subject: {
          type: "object",
          required: ["referenceIdentifier", "entityType", "referenceType"],
          properties: {
            referenceIdentifier: { type: "string" },
            entityType: { type: "string", enum: FIDE_ENTITY_TYPE_ENUM },
            referenceType: { type: "string", enum: FIDE_ENTITY_TYPE_ENUM },
          },
        },
        predicate: {
          type: "object",
          required: ["referenceIdentifier", "entityType", "referenceType"],
          properties: {
            referenceIdentifier: { type: "string", format: "uri" },
            entityType: { type: "string", enum: ["Concept"] },
            referenceType: { type: "string", enum: ["NetworkResource"] },
          },
        },
        object: {
          type: "object",
          required: ["referenceIdentifier", "entityType", "referenceType"],
          properties: {
            referenceIdentifier: { type: "string" },
            entityType: { type: "string", enum: FIDE_ENTITY_TYPE_ENUM },
            referenceType: { type: "string", enum: FIDE_ENTITY_TYPE_ENUM },
          },
        },
      },
    },
    subjectEntityTypeEnum: FIDE_ENTITY_TYPE_ENUM,
    subjectReferenceTypeEnum: FIDE_ENTITY_TYPE_ENUM,
    predicateEntityTypeEnum: ["Concept"],
    predicateReferenceTypeEnum: ["NetworkResource"],
    objectEntityTypeEnum: FIDE_ENTITY_TYPE_ENUM,
    objectReferenceTypeEnum: FIDE_ENTITY_TYPE_ENUM,
    policyNotes: [
      "Predicate must use entityType=Concept and referenceType=NetworkResource.",
      "Allowed entity/reference pairings are further validated by Fide ID policy at runtime.",
      "Use --format json|jsonl|fsd as needed; this schema describes statement-input payload shape.",
    ],
  },
} as const;
