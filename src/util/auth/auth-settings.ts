import { rm } from "node:fs/promises";
import {
  ensureAccountSettingsPathPermissions,
  getAccountNotFoundError,
  readStoredAccountSettings,
  resolveAccountSettingsPath,
  resolveSelectedAccount,
  writeStoredAccountSettings,
} from "./account-settings.js";

export const DEFAULT_FIDE_API_BASE_URL = "https://api.fide.work";

export type StoredAuthSettings = {
  accessToken: string;
};

export type ResolvedAuthSettings = StoredAuthSettings & {
  baseUrl: string;
  source: "env" | "account";
  path: string;
  accountId: string | null;
};

export async function readStoredAuthSettings(accountId: string): Promise<StoredAuthSettings | null> {
  const parsed = await readStoredAccountSettings(accountId);
  const accessToken = typeof parsed?.accessToken === "string" && parsed.accessToken.trim().length > 0
    ? parsed.accessToken.trim()
    : null;
  if (!accessToken) {
    return null;
  }
  return {
    accessToken,
  };
}

export async function writeStoredAuthSettings(accountId: string, settings: StoredAuthSettings): Promise<void> {
  await writeStoredAccountSettings(accountId, {
    accessToken: settings.accessToken,
  });
  await ensureAccountSettingsPathPermissions(accountId);
}

export async function clearStoredAuthSettings(accountId: string): Promise<void> {
  const existing = await readStoredAccountSettings(accountId);
  if (!existing) {
    await rm(resolveAccountSettingsPath(accountId), { force: true });
    return;
  }
  const next = { ...existing };
  delete next.accessToken;
  await writeStoredAccountSettings(accountId, next);
}

export async function resolveAuthSettings(
  flags: Map<string, string | boolean> = new Map(),
  root: string = process.cwd(),
): Promise<ResolvedAuthSettings | null> {
  const envBaseUrl = process.env.FIDE_API_BASE_URL?.trim();
  const envAccessToken = process.env.FIDE_ACCESS_TOKEN?.trim();

  if (envAccessToken) {
    return {
      baseUrl: envBaseUrl ?? DEFAULT_FIDE_API_BASE_URL,
      accessToken: envAccessToken,
      source: "env",
      path: "env",
      accountId: null,
    };
  }

  const accountSelection = await resolveSelectedAccount(flags, root);
  if (!accountSelection) {
    return null;
  }

  const stored = await readStoredAuthSettings(accountSelection.accountId);
  if (!stored) {
    throw getAccountNotFoundError(accountSelection.accountId);
  }

  return {
    ...stored,
    baseUrl: envBaseUrl ?? DEFAULT_FIDE_API_BASE_URL,
    source: "account",
    path: resolveAccountSettingsPath(accountSelection.accountId),
    accountId: accountSelection.accountId,
  };
}

export async function resolveApiBaseUrl(
  explicitBaseUrl?: string | null,
  flags: Map<string, string | boolean> = new Map(),
  root: string = process.cwd(),
): Promise<string> {
  const flagBaseUrl = explicitBaseUrl?.trim();
  if (flagBaseUrl) {
    return flagBaseUrl;
  }

  const envBaseUrl = process.env.FIDE_API_BASE_URL?.trim();
  if (envBaseUrl) {
    return envBaseUrl;
  }

  return DEFAULT_FIDE_API_BASE_URL;
}
