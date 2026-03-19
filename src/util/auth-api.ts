import { errorResponse } from "./response.js";

export type MeResponse = {
  type: "user" | "api_key" | "service";
  id: string;
  userId: string | null;
  userType?: "human" | "agent" | "service_account" | null;
  managementMode?: "self" | "workspace" | "controller" | null;
  apiKeysEnabled?: boolean | null;
  managingWorkspaceId?: string | null;
  workspaceId: string | null;
  workspaceIds: string[];
  roles: string[];
  permissions: string[];
  apiKeyId?: string;
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
    throw new Error(errorResponse(fallbackScope, message, {
      status: response.status,
    }).error);
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
  };
}
