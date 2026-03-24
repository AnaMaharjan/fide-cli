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
    type?: "human" | "agent" | null;
    managementMode?: "self" | "workspace" | "controller" | null;
  };
  access: {
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
  name: string;
  createdAt: string;
  roles: string[];
};

export type WorkspaceSettingsResponse = {
  settings: Record<string, unknown>;
};

export type WorkspaceGraph = {
  graphKey: string;
  type: "postgres" | "sqlite" | "fide-jsonl";
  schema?: string | null;
  gitignore?: boolean;
  recipe?: unknown;
  metadata?: unknown;
  createdAt: string;
  updatedAt: string;
};

export type GraphQuery = {
  graphKey: string;
  name: string;
  description: string | null;
  sql: string;
};

export type GraphQueryRunResult = GraphQuery & {
  queryCatalogKey: string;
  graphStoreKey: string;
  sqlPreview: string;
  rowCount: number;
  truncated: boolean;
  rows: unknown[];
};

export type GraphQuerySummary = {
  graphKey: string;
  name: string;
  description: string | null;
};

export type WorkspaceMember = {
  userId: string;
  userType?: "human" | "agent" | null;
  managementMode?: "self" | "workspace" | "controller" | null;
  managingWorkspaceId?: string | null;
  createdAt: string;
  roles: string[];
  permissions: string[];
};

export type WorkspaceMemberMutation = {
  ok: boolean;
  workspaceId: string;
  userId: string;
  roleCode: string;
};

type AuthClientOptions = {
  baseUrl: string;
  apiKey?: string;
};

export type AgentAuthRequestSummary = {
  id: string;
  status: "pending" | "completed" | "exchanged" | "expired" | "cancelled";
  requestedWorkspaceId: string | null;
  loopbackUrl: string | null;
  agentLabel: string | null;
  expiresAt: string;
  completedAt: string | null;
  exchangedAt: string | null;
  createdAt: string;
  updatedAt: string;
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
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (options.apiKey) {
    headers["x-api-key"] = options.apiKey;
  }

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

    async createAgentAuthRequest(input: {
      requestedWorkspaceId?: string | null;
      loopbackUrl?: string | null;
      agentName?: string | null;
      expiresInSeconds?: number;
    }): Promise<{ request: AgentAuthRequestSummary; agentLoginUrl: string }> {
      const response = await fetch(`${baseUrl}/v1/agent-auth/requests`, {
        method: "POST",
        headers,
        body: JSON.stringify(input),
      });
      return parseApiResponse<{ request: AgentAuthRequestSummary; agentLoginUrl: string }>(response, "auth-agent-request-create.v1");
    },

    async getAgentAuthRequest(requestId: string): Promise<{ request: AgentAuthRequestSummary }> {
      const response = await fetch(`${baseUrl}/v1/agent-auth/requests/${encodeURIComponent(requestId)}`, {
        method: "GET",
        headers,
      });
      return parseApiResponse<{ request: AgentAuthRequestSummary }>(response, "auth-agent-request-get.v1");
    },

    async exchangeAgentAuthRequest(input: {
      requestId: string;
      exchangeCode: string;
    }): Promise<{
      request: AgentAuthRequestSummary;
      result: {
        workspaceId: string;
        agentUserId: string;
        apiKey: string;
        apiKeyPrefix: string;
      };
    }> {
      const response = await fetch(`${baseUrl}/v1/agent-auth/requests/${encodeURIComponent(input.requestId)}/exchange`, {
        method: "POST",
        headers,
        body: JSON.stringify({ exchangeCode: input.exchangeCode }),
      });
      return parseApiResponse<{
        request: AgentAuthRequestSummary;
        result: {
          workspaceId: string;
          agentUserId: string;
          apiKey: string;
          apiKeyPrefix: string;
        };
      }>(response, "auth-agent-request-exchange.v1");
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

    async listWorkspaceGraphs(workspaceId: string): Promise<WorkspaceGraph[]> {
      const response = await fetch(`${baseUrl}/v1/workspaces/${workspaceId}/graphs`, {
        method: "GET",
        headers,
      });
      return parseApiResponse<WorkspaceGraph[]>(response, "graph-list.v1");
    },

    async getWorkspaceGraph(workspaceId: string, graphKey: string): Promise<WorkspaceGraph> {
      const response = await fetch(`${baseUrl}/v1/workspaces/${workspaceId}/graphs/${encodeURIComponent(graphKey)}`, {
        method: "GET",
        headers,
      });
      return parseApiResponse<WorkspaceGraph>(response, "graph-get.v1");
    },

    async saveWorkspaceGraph(input: {
      workspaceId: string;
      graphKey: string;
      graph: Omit<WorkspaceGraph, "graphKey" | "createdAt" | "updatedAt">;
    }): Promise<WorkspaceGraph> {
      const response = await fetch(`${baseUrl}/v1/workspaces/${input.workspaceId}/graphs/${encodeURIComponent(input.graphKey)}`, {
        method: "PUT",
        headers,
        body: JSON.stringify(input.graph),
      });
      return parseApiResponse<WorkspaceGraph>(response, "graph-save-workspace.v1");
    },

    async listGraphQueries(input: {
      workspaceId: string;
      queryCatalog?: string;
    }): Promise<{ queryCatalogKey: string; queries: GraphQuerySummary[] }> {
      const search = new URLSearchParams()
      if (input.queryCatalog) search.set("queryCatalog", input.queryCatalog)
      const suffix = search.size > 0 ? `?${search.toString()}` : ""
      const response = await fetch(`${baseUrl}/v1/workspaces/${input.workspaceId}/queries${suffix}`, {
        method: "GET",
        headers,
      });
      return parseApiResponse<{ queryCatalogKey: string; queries: GraphQuerySummary[] }>(response, "graph-query-list-workspace.v1");
    },

    async getGraphQuery(input: {
      workspaceId: string;
      graphKey: string;
      name: string;
      queryCatalog?: string;
    }): Promise<GraphQuery> {
      const search = new URLSearchParams()
      if (input.queryCatalog) search.set("queryCatalog", input.queryCatalog)
      const suffix = search.size > 0 ? `?${search.toString()}` : ""
      const response = await fetch(
        `${baseUrl}/v1/workspaces/${input.workspaceId}/queries/${encodeURIComponent(input.graphKey)}/${encodeURIComponent(input.name)}${suffix}`,
        {
          method: "GET",
          headers,
        },
      );
      return parseApiResponse<GraphQuery>(response, "graph-query-get-workspace.v1");
    },

    async saveGraphQuery(input: {
      workspaceId: string;
      graphKey: string;
      name: string;
      sql: string;
      description?: string | null;
      queryCatalog?: string;
    }): Promise<{ queryCatalogKey: string; query: GraphQuery }> {
      const response = await fetch(
        `${baseUrl}/v1/workspaces/${input.workspaceId}/queries/${encodeURIComponent(input.graphKey)}/${encodeURIComponent(input.name)}`,
        {
          method: "PUT",
          headers,
          body: JSON.stringify({
            sql: input.sql,
            ...(typeof input.description === "string" ? { description: input.description } : {}),
            ...(input.queryCatalog ? { queryCatalog: input.queryCatalog } : {}),
          }),
        },
      );
      return parseApiResponse<{ queryCatalogKey: string; query: GraphQuery }>(response, "graph-query-save-workspace.v1");
    },

    async runGraphQuery(input: {
      workspaceId: string;
      graphKey: string;
      name: string;
      queryCatalog?: string;
      limit?: number;
    }): Promise<GraphQueryRunResult> {
      const response = await fetch(
        `${baseUrl}/v1/workspaces/${input.workspaceId}/queries/${encodeURIComponent(input.graphKey)}/${encodeURIComponent(input.name)}/run`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            ...(input.queryCatalog ? { queryCatalog: input.queryCatalog } : {}),
            ...(typeof input.limit === "number" ? { limit: input.limit } : {}),
          }),
        },
      );
      return parseApiResponse<GraphQueryRunResult>(response, "graph-query-run-workspace.v1");
    },

    async listWorkspaceMembers(id: string): Promise<{ members: WorkspaceMember[] }> {
      const response = await fetch(`${baseUrl}/v1/workspaces/${id}/members`, {
        method: "GET",
        headers,
      });
      return parseApiResponse<{ members: WorkspaceMember[] }>(response, "workspace-members.v1");
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
