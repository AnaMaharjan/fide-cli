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
