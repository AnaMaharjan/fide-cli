import { errorResponse } from "./response.js";

class ApiResponseError extends Error {
  hint?: string;
  next?: Record<string, unknown>;
  details?: Record<string, unknown>;
  status?: number;
}

export type MeResponse = {
  auth: {
    type: "user" | "api_key" | "service";
  };
  user: {
    id: string | null;
    type?: "human" | "agent" | "service_account" | null;
    managementMode?: "self" | "workspace" | "controller" | null;
  };
  access: {
    apiKeysEnabled?: boolean | null;
    managingWorkspaceId?: string | null;
    workspaceId: string | null;
    workspaceIds: string[];
    roles: string[];
    permissions: string[];
  };
};

export type ApiKeySummary = {
  id: string;
  userId: string;
  label: string;
  keyPrefix: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
};

export type WorkspaceSummary = {
  id: string;
  slug: string;
  name: string;
  createdAt: string;
  roles: string[];
};

export type WorkspaceSettingsResponse = {
  settings: Record<string, unknown>;
};

export type WorkspaceConnection = {
  id: string;
  workspaceId: string;
  slug: string;
  kind: string;
  secretId: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
};

export type WorkspaceQuery = {
  statementStoreKey: string;
  name: string;
  description: string | null;
  sql: string;
};

export type WorkspaceQueryRunResult = WorkspaceQuery & {
  queryStoreKey: string;
  graphStoreKey: string;
  sqlPreview: string;
  rowCount: number;
  truncated: boolean;
  rows: unknown[];
};

export type WorkspaceQuerySummary = {
  statementStoreKey: string;
  name: string;
  description: string | null;
};

export type WorkspaceMember = {
  userId: string;
  userType?: "human" | "agent" | "service_account" | null;
  managementMode?: "self" | "workspace" | "controller" | null;
  apiKeysEnabled?: boolean | null;
  managingWorkspaceId?: string | null;
  createdAt: string;
  roles: string[];
  permissions: string[];
};

export type CreatedServiceAccount = {
  userId: string;
  workspaceId: string;
  roleCode: string;
  email: string;
};

export type WorkspaceMemberMutation = {
  ok: boolean;
  workspaceId: string;
  userId: string;
  roleCode: string;
};

type AuthClientOptions = {
  baseUrl: string;
  apiKey: string;
};

export type EmailAuthStartResponse = {
  ok: true;
  email: string;
};

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/u, "");
}

async function parseApiResponse<T>(response: Response, fallbackScope: string): Promise<T> {
  const text = await response.text();
  const data = text ? JSON.parse(text) as Record<string, unknown> : {};
  if (!response.ok) {
    const message = typeof data.error === "string"
      ? data.error
      : `Request failed with status ${response.status}`;
    const payload = errorResponse(fallbackScope, message, {
      status: response.status,
      ...(data.details && typeof data.details === "object" ? { details: data.details as Record<string, unknown> } : {}),
    });
    const error = new ApiResponseError(payload.error);
    error.status = response.status;
    if (typeof data.hint === "string") {
      error.hint = data.hint;
    }
    if (data.next && typeof data.next === "object") {
      error.next = data.next as Record<string, unknown>;
    }
    if (data.details && typeof data.details === "object") {
      error.details = data.details as Record<string, unknown>;
    }
    throw error;
  }
  return data as T;
}

export function createAuthApiClient(options: AuthClientOptions) {
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const headers = {
    "content-type": "application/json",
    "x-api-key": options.apiKey,
  };

  return {
    async me(): Promise<MeResponse> {
      const response = await fetch(`${baseUrl}/v1/me`, {
        method: "GET",
        headers,
      });
      return parseApiResponse<MeResponse>(response, "auth-whoami.v1");
    },

    async listApiKeys(): Promise<{ apiKeys: ApiKeySummary[] }> {
      const response = await fetch(`${baseUrl}/v1/api-keys`, {
        method: "GET",
        headers,
      });
      return parseApiResponse<{ apiKeys: ApiKeySummary[] }>(response, "auth-keys-list.v1");
    },

    async createApiKey(input: {
      label: string;
      userId?: string;
      expiresAt?: string | null;
    }): Promise<{ apiKey: ApiKeySummary; rawKey: string }> {
      const response = await fetch(`${baseUrl}/v1/api-keys`, {
        method: "POST",
        headers,
        body: JSON.stringify(input),
      });
      return parseApiResponse<{ apiKey: ApiKeySummary; rawKey: string }>(response, "auth-keys-create.v1");
    },

    async revokeApiKey(id: string): Promise<{ ok: boolean }> {
      const response = await fetch(`${baseUrl}/v1/api-keys/${id}/revoke`, {
        method: "POST",
        headers,
      });
      return parseApiResponse<{ ok: boolean }>(response, "auth-keys-revoke.v1");
    },

    async listWorkspaces(): Promise<{ workspaces: WorkspaceSummary[] }> {
      const response = await fetch(`${baseUrl}/v1/workspaces`, {
        method: "GET",
        headers,
      });
      return parseApiResponse<{ workspaces: WorkspaceSummary[] }>(response, "workspace-list.v1");
    },

    async getWorkspace(id: string): Promise<WorkspaceSummary> {
      const response = await fetch(`${baseUrl}/v1/workspaces/${id}`, {
        method: "GET",
        headers,
      });
      return parseApiResponse<WorkspaceSummary>(response, "workspace-get.v1");
    },

    async getWorkspaceSettings(id: string): Promise<WorkspaceSettingsResponse> {
      const response = await fetch(`${baseUrl}/v1/workspaces/${id}/settings`, {
        method: "GET",
        headers,
      });
      return parseApiResponse<WorkspaceSettingsResponse>(response, "workspace-settings-get.v1");
    },

    async setWorkspaceSettings(id: string, settings: Record<string, unknown>): Promise<WorkspaceSettingsResponse> {
      const response = await fetch(`${baseUrl}/v1/workspaces/${id}/settings`, {
        method: "PUT",
        headers,
        body: JSON.stringify({ settings }),
      });
      return parseApiResponse<WorkspaceSettingsResponse>(response, "workspace-settings-set.v1");
    },

    async listWorkspaceConnections(id: string): Promise<{ connections: WorkspaceConnection[] }> {
      const response = await fetch(`${baseUrl}/v1/workspaces/${id}/connections`, {
        method: "GET",
        headers,
      });
      return parseApiResponse<{ connections: WorkspaceConnection[] }>(response, "workspace-connections-list.v1");
    },

    async createWorkspaceConnection(input: {
      workspaceId: string;
      slug: string;
      kind: string;
      description?: string;
    } & ({
      secretId: string;
      connection?: never;
    } | {
      secretId?: never;
      connection: string;
    })): Promise<WorkspaceConnection> {
      const response = await fetch(`${baseUrl}/v1/workspaces/${input.workspaceId}/connections`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          slug: input.slug,
          kind: input.kind,
          ...(input.secretId ? { secretId: input.secretId } : { connection: input.connection }),
          description: input.description,
        }),
      });
      return parseApiResponse<WorkspaceConnection>(response, "workspace-connections-create.v1");
    },

    async listWorkspaceQueries(input: {
      workspaceId: string;
      queryStore?: string;
    }): Promise<{ queryStoreKey: string; queries: WorkspaceQuerySummary[] }> {
      const search = new URLSearchParams()
      if (input.queryStore) search.set("queryStore", input.queryStore)
      const suffix = search.size > 0 ? `?${search.toString()}` : ""
      const response = await fetch(`${baseUrl}/v1/workspaces/${input.workspaceId}/queries${suffix}`, {
        method: "GET",
        headers,
      });
      return parseApiResponse<{ queryStoreKey: string; queries: WorkspaceQuerySummary[] }>(response, "workspace-queries-list.v1");
    },

    async getWorkspaceQuery(input: {
      workspaceId: string;
      statementStoreKey: string;
      name: string;
      queryStore?: string;
    }): Promise<WorkspaceQuery> {
      const search = new URLSearchParams()
      if (input.queryStore) search.set("queryStore", input.queryStore)
      const suffix = search.size > 0 ? `?${search.toString()}` : ""
      const response = await fetch(
        `${baseUrl}/v1/workspaces/${input.workspaceId}/queries/${encodeURIComponent(input.statementStoreKey)}/${encodeURIComponent(input.name)}${suffix}`,
        {
          method: "GET",
          headers,
        },
      );
      return parseApiResponse<WorkspaceQuery>(response, "workspace-query-get.v1");
    },

    async runWorkspaceQuery(input: {
      workspaceId: string;
      statementStoreKey: string;
      name: string;
      queryStore?: string;
      limit?: number;
    }): Promise<WorkspaceQueryRunResult> {
      const response = await fetch(
        `${baseUrl}/v1/workspaces/${input.workspaceId}/queries/${encodeURIComponent(input.statementStoreKey)}/${encodeURIComponent(input.name)}/run`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            ...(input.queryStore ? { queryStore: input.queryStore } : {}),
            ...(typeof input.limit === "number" ? { limit: input.limit } : {}),
          }),
        },
      );
      return parseApiResponse<WorkspaceQueryRunResult>(response, "workspace-query-run.v1");
    },

    async listWorkspaceMembers(id: string): Promise<{ members: WorkspaceMember[] }> {
      const response = await fetch(`${baseUrl}/v1/workspaces/${id}/members`, {
        method: "GET",
        headers,
      });
      return parseApiResponse<{ members: WorkspaceMember[] }>(response, "workspace-members.v1");
    },

    async createServiceAccount(input: {
      workspaceId: string;
      label: string;
      roleCode: string;
    }): Promise<CreatedServiceAccount> {
      const response = await fetch(`${baseUrl}/v1/workspaces/${input.workspaceId}/service-accounts`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          label: input.label,
          roleCode: input.roleCode,
        }),
      });
      return parseApiResponse<CreatedServiceAccount>(response, "workspace-service-account-create.v1");
    },

    async addWorkspaceMember(input: {
      workspaceId: string;
      userId: string;
      roleCode: string;
    }): Promise<WorkspaceMemberMutation> {
      const response = await fetch(`${baseUrl}/v1/workspaces/${input.workspaceId}/members`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          userId: input.userId,
          roleCode: input.roleCode,
        }),
      });
      return parseApiResponse<WorkspaceMemberMutation>(response, "workspace-members-add.v1");
    },

    async grantWorkspaceRole(input: {
      workspaceId: string;
      userId: string;
      roleCode: string;
    }): Promise<WorkspaceMemberMutation> {
      const response = await fetch(`${baseUrl}/v1/workspaces/${input.workspaceId}/members/${input.userId}/roles`, {
        method: "POST",
        headers,
        body: JSON.stringify({ roleCode: input.roleCode }),
      });
      return parseApiResponse<WorkspaceMemberMutation>(response, "workspace-roles-grant.v1");
    },

    async revokeWorkspaceRole(input: {
      workspaceId: string;
      userId: string;
      roleCode: string;
    }): Promise<WorkspaceMemberMutation> {
      const response = await fetch(`${baseUrl}/v1/workspaces/${input.workspaceId}/members/${input.userId}/roles/${encodeURIComponent(input.roleCode)}`, {
        method: "DELETE",
        headers,
      });
      return parseApiResponse<WorkspaceMemberMutation>(response, "workspace-roles-revoke.v1");
    },
  };
}

export function createBootstrapAuthApiClient(baseUrlInput: string) {
  const baseUrl = normalizeBaseUrl(baseUrlInput);
  const headers = {
    "content-type": "application/json",
  };

  return {
    async startEmailAuth(email: string): Promise<EmailAuthStartResponse> {
      const response = await fetch(`${baseUrl}/v1/auth/email/start`, {
        method: "POST",
        headers,
        body: JSON.stringify({ email }),
      });
      return parseApiResponse<EmailAuthStartResponse>(response, "auth-login-email-start.v1");
    },

    async verifyEmailAuth(input: {
      email: string;
      otp: string;
      label?: string;
    }): Promise<{ apiKey: ApiKeySummary; rawKey: string }> {
      const response = await fetch(`${baseUrl}/v1/auth/email/verify`, {
        method: "POST",
        headers,
        body: JSON.stringify(input),
      });
      return parseApiResponse<{ apiKey: ApiKeySummary; rawKey: string }>(response, "auth-login-email-verify.v1");
    },
  };
}
