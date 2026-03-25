import { rm } from "node:fs/promises";
import { getStringFlag } from "./args.js";
import {
  ensureProfileSettingsPathPermissions,
  getProfileNotFoundError,
  readStoredProfileSettings,
  resolveProfileSettingsPath,
  resolveProfileSelection,
  writeStoredProfileSettings,
} from "./profile-settings.js";

export const DEFAULT_FIDE_API_BASE_URL = "https://api.fide.work";

export type StoredAuthSettings = {
  baseUrl: string;
  accessToken: string;
};

export type ResolvedAuthSettings = StoredAuthSettings & {
  source: "env" | "profile";
  path: string;
  profile: string | null;
};

export async function readStoredAuthSettings(profile: string): Promise<StoredAuthSettings | null> {
  const parsed = await readStoredProfileSettings(profile);
  const accessToken = typeof parsed?.accessToken === "string" && parsed.accessToken.trim().length > 0
    ? parsed.accessToken.trim()
    : null;
  if (!accessToken) {
    return null;
  }
  return {
    baseUrl: typeof parsed?.apiBaseUrl === "string" && parsed.apiBaseUrl.trim().length > 0
      ? parsed.apiBaseUrl.trim()
      : DEFAULT_FIDE_API_BASE_URL,
    accessToken,
  };
}

export async function writeStoredAuthSettings(profile: string, settings: StoredAuthSettings): Promise<void> {
  const existing = await readStoredProfileSettings(profile);
  await writeStoredProfileSettings(profile, {
    ...existing,
    apiBaseUrl: settings.baseUrl,
    accessToken: settings.accessToken,
  });
  await ensureProfileSettingsPathPermissions(profile);
}

export async function clearStoredAuthSettings(profile: string): Promise<void> {
  const existing = await readStoredProfileSettings(profile);
  if (!existing) {
    await rm(resolveProfileSettingsPath(profile), { force: true });
    return;
  }
  const next = { ...existing };
  delete next.apiBaseUrl;
  delete next.accessToken;
  await writeStoredProfileSettings(profile, next);
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
      profile: null,
    };
  }

  const profileSelection = await resolveProfileSelection(flags, root);
  if (!profileSelection) {
    return null;
  }

  const stored = await readStoredAuthSettings(profileSelection.profile);
  if (!stored) {
    throw getProfileNotFoundError(profileSelection.profile);
  }

  return {
    ...stored,
    source: "profile",
    path: resolveProfileSettingsPath(profileSelection.profile),
    profile: profileSelection.profile,
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

  const profileFromFlag = getStringFlag(flags, "profile");
  const profileSelection = await resolveProfileSelection(
    profileFromFlag ? new Map([["profile", profileFromFlag]]) : flags,
    root,
  );
  if (profileSelection) {
    const stored = await readStoredAuthSettings(profileSelection.profile);
    if (stored?.baseUrl) {
      return stored.baseUrl;
    }
  }

  return DEFAULT_FIDE_API_BASE_URL;
}
