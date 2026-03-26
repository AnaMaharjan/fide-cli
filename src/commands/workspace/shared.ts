import { resolveWorkspaceSelectionOrThrow } from "../../util/workspace/workspace-settings.js";
import { createAuthApiClient } from "../../util/auth/auth-api.js";
import type { MeResponse } from "../../util/auth/auth-api.js";
import type { ResolvedAuthSettings } from "../../util/auth/auth-settings.js";
import { resolveAuthSettings } from "../../util/auth/auth-settings.js";
import type { WorkspaceSelectionSource } from "../../util/workspace/workspace-settings.js";

type HostedCommandDebugInput = {
  auth: ResolvedAuthSettings;
  client: ReturnType<typeof createAuthApiClient>;
  targetScope?: "workspace";
  workspaceId?: string;
  workspaceSelectionSource?: WorkspaceSelectionSource;
  graphKey?: string;
  queryName?: string;
  accountId?: string;
  roleKey?: string;
  email?: string;
};

type CliAugmentedError = Error & {
  hint?: string;
  details?: Record<string, unknown>;
  next?: Record<string, unknown>;
};

function getAccessTokenPreview(accessToken: string): string {
  return accessToken.slice(0, 16);
}

function parseReportedUserId(message: string): string | null {
  const match = message.match(/Workspace membership record not found for user (\S+) in workspace /u);
  return match?.[1] ?? null;
}

function isWorkspaceMembershipLookupError(error: Error): boolean {
  return /Workspace membership record not found for user /u.test(error.message);
}

async function readAuthenticatedSubject(
  client: ReturnType<typeof createAuthApiClient>,
): Promise<MeResponse | null> {
  try {
    return await client.me();
  } catch {
    return null;
  }
}

export async function requireWorkspaceApiClient(flags: Map<string, string | boolean> = new Map()) {
  const auth = await resolveAuthSettings(flags);
  if (!auth) {
    throw new Error("No Fide auth account resolved. Set FIDE_ACCOUNT_ID, set project .fide/settings.json with account.id, or run `fide login`.");
  }
  return {
    auth,
    client: createAuthApiClient(auth),
  };
}

export async function requireHostedWorkspaceTarget(flags: Map<string, string | boolean> = new Map()) {
  return resolveWorkspaceSelectionOrThrow(flags);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? value as Record<string, unknown> : null;
}

function getExistingDetails(error: unknown): Record<string, unknown> | null {
  const record = asRecord(error);
  return record?.details && typeof record.details === "object"
    ? record.details as Record<string, unknown>
    : null;
}

function getExistingHint(error: unknown): string | null {
  const record = asRecord(error);
  return typeof record?.hint === "string" ? record.hint : null;
}

function getExistingNext(error: unknown): Record<string, unknown> | null {
  const record = asRecord(error);
  return record?.next && typeof record.next === "object"
    ? record.next as Record<string, unknown>
    : null;
}

export async function enrichHostedCommandError(
  error: unknown,
  input: HostedCommandDebugInput,
): Promise<unknown> {
  const me = await readAuthenticatedSubject(input.client);
  const authenticatedUserId = me?.user.id ?? null;
  const authenticatedWorkspaceId = me?.access.workspaceId ?? null;
  const accessTokenPreview = getAccessTokenPreview(input.auth.accessToken);
  const baseDetails: Record<string, unknown> = {
    source: input.auth.source,
    accessTokenPreview,
    authenticatedUserId,
    authenticatedUserType: me?.user.type ?? null,
    authenticatedManagementMode: me?.user.managementMode ?? null,
    authenticatedWorkspaceId,
  };
  if (input.targetScope) baseDetails.targetScope = input.targetScope;
  if (input.workspaceId) baseDetails.workspaceId = input.workspaceId;
  if (input.workspaceSelectionSource) baseDetails.workspaceSelectionSource = input.workspaceSelectionSource;
  if (input.graphKey) baseDetails.graphKey = input.graphKey;
  if (input.queryName) baseDetails.queryName = input.queryName;
  if (input.accountId) baseDetails.accountId = input.accountId;
  if (input.roleKey) baseDetails.roleKey = input.roleKey;
  if (input.email) baseDetails.email = input.email;

  if (!(error instanceof Error)) {
    return error;
  }

  const originalError = error;

  if (isWorkspaceMembershipLookupError(originalError)) {
    const reportedUserId = parseReportedUserId(originalError.message);
    const enriched = new Error(
      `Workspace membership lookup failed for workspace ${input.workspaceId ?? "unknown"}. `
      + `Authenticated user ${authenticatedUserId ?? "unknown"} `
      + `using access token preview ${accessTokenPreview} does not appear to map to a workspace member record.`,
    ) as CliAugmentedError;

    enriched.hint =
      "Run `fide whoami` to compare the authenticated subject with the workspace member identity expected by the backend.";
    enriched.details = {
      ...getExistingDetails(originalError),
      ...baseDetails,
      reportedMissingUserId: reportedUserId,
      originalError: originalError.message,
    };
    const existingNext = getExistingNext(originalError);
    if (existingNext) enriched.next = existingNext;
    return enriched;
  }

  const enriched = new Error(originalError.message) as CliAugmentedError;
  const existingHint = getExistingHint(originalError);
  if (existingHint) enriched.hint = existingHint;
  enriched.details = {
    ...getExistingDetails(originalError),
    ...baseDetails,
  };
  const existingNext = getExistingNext(originalError);
  if (existingNext) enriched.next = existingNext;
  return enriched;
}

export async function runHostedOperation<T>(
  operation: () => Promise<T>,
  input: HostedCommandDebugInput,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    throw await enrichHostedCommandError(error, input);
  }
}
