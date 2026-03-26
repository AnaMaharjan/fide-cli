import { errorResponse } from "./response.js";

class ApiResponseError extends Error {
  hint?: string;
  next?: Record<string, unknown>;
  details?: Record<string, unknown>;
  status?: number;
}

export type MeResponse = {
  auth: {
    type: "user" | "service";
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

export type WorkspaceSummary = {
  id: string;
  name: string;
  createdAt: string;
  roles: string[];
};

export type WorkspaceGraph = {
  graphKey: string;
  type: "postgres" | "sqlite" | "fide-jsonl";
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
  selectorType?: "user_id" | "human_email";
  resultType?: "member_added" | "invitation_created";
  userId: string | null;
  email?: string | null;
  addedExistingUser?: boolean;
  roleKey: string;
};

type AuthClientOptions = {
  baseUrl: string;
  accessToken?: string;
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
  if (options.accessToken) {
    headers.Authorization = `Bearer ${options.accessToken}`;
  }

  return {
    async me(): Promise<MeResponse> {
      const response = await fetch(`${baseUrl}/v1/me`, {
        method: "GET",
        headers,
      });
      return parseApiResponse<MeResponse>(response, "auth-whoami.v1");
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
        accessToken: string;
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
          accessToken: string;
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

    async updateWorkspace(input: {
      workspaceId: string;
      name: string;
    }): Promise<WorkspaceSummary> {
      const response = await fetch(`${baseUrl}/v1/workspaces/${input.workspaceId}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ name: input.name }),
      });
      return parseApiResponse<WorkspaceSummary>(response, "workspace-update.v1");
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

    async deleteWorkspaceGraph(input: {
      workspaceId: string;
      graphKey: string;
    }): Promise<{ ok: boolean }> {
      const response = await fetch(`${baseUrl}/v1/workspaces/${input.workspaceId}/graphs/${encodeURIComponent(input.graphKey)}`, {
        method: "DELETE",
        headers,
      });
      return parseApiResponse<{ ok: boolean }>(response, "graph-delete-workspace.v1");
    },

    async listGraphQueries(input: {
      workspaceId: string;
    }): Promise<{ queries: GraphQuerySummary[] }> {
      const response = await fetch(`${baseUrl}/v1/workspaces/${input.workspaceId}/queries`, {
        method: "GET",
        headers,
      });
      return parseApiResponse<{ queries: GraphQuerySummary[] }>(response, "graph-query-list-workspace.v1");
    },

    async getGraphQuery(input: {
      workspaceId: string;
      graphKey: string;
      name: string;
    }): Promise<GraphQuery> {
      const response = await fetch(
        `${baseUrl}/v1/workspaces/${input.workspaceId}/queries/${encodeURIComponent(input.graphKey)}/${encodeURIComponent(input.name)}`,
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
    }): Promise<{ query: GraphQuery }> {
      const response = await fetch(
        `${baseUrl}/v1/workspaces/${input.workspaceId}/queries/${encodeURIComponent(input.graphKey)}/${encodeURIComponent(input.name)}`,
        {
          method: "PUT",
          headers,
          body: JSON.stringify({
            sql: input.sql,
            ...(typeof input.description === "string" ? { description: input.description } : {}),
          }),
        },
      );
      return parseApiResponse<{ query: GraphQuery }>(response, "graph-query-save-workspace.v1");
    },

    async runGraphQuery(input: {
      workspaceId: string;
      graphKey: string;
      name: string;
      limit?: number;
    }): Promise<GraphQueryRunResult> {
      const response = await fetch(
        `${baseUrl}/v1/workspaces/${input.workspaceId}/queries/${encodeURIComponent(input.graphKey)}/${encodeURIComponent(input.name)}/run`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
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
      userId?: string;
      email?: string;
      roleKey: string;
    }): Promise<WorkspaceMemberMutation> {
      const response = await fetch(`${baseUrl}/v1/workspaces/${input.workspaceId}/members`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          ...(input.userId ? { userId: input.userId } : {}),
          ...(input.email ? { email: input.email } : {}),
          roleKey: input.roleKey,
        }),
      });
      return parseApiResponse<WorkspaceMemberMutation>(response, "workspace-members-add.v1");
    },

    async grantWorkspaceRole(input: {
      workspaceId: string;
      userId: string;
      roleKey: string;
    }): Promise<WorkspaceMemberMutation> {
      const response = await fetch(`${baseUrl}/v1/workspaces/${input.workspaceId}/members/${input.userId}/roles`, {
        method: "POST",
        headers,
        body: JSON.stringify({ roleKey: input.roleKey }),
      });
      return parseApiResponse<WorkspaceMemberMutation>(response, "workspace-roles-grant.v1");
    },

    async revokeWorkspaceRole(input: {
      workspaceId: string;
      userId: string;
      roleKey: string;
    }): Promise<WorkspaceMemberMutation> {
      const response = await fetch(`${baseUrl}/v1/workspaces/${input.workspaceId}/members/${input.userId}/roles/${encodeURIComponent(input.roleKey)}`, {
        method: "DELETE",
        headers,
      });
      return parseApiResponse<WorkspaceMemberMutation>(response, "workspace-roles-revoke.v1");
    },
  };
}
