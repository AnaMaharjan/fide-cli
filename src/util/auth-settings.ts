import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { getStringFlag } from "./args.js";
import {
  ensureProfileAuthPathPermissions,
  getProfileNotFoundError,
  resolveProfileAuthPath,
  resolveProfileSelection,
} from "./profile-settings.js";

export const DEFAULT_FIDE_API_BASE_URL = "https://api.fide.work";

export type StoredAuthSettings = {
  baseUrl: string;
  apiKey: string;
};

export type ResolvedAuthSettings = StoredAuthSettings & {
  source: "env" | "profile";
  path: string;
  profile: string | null;
};

export async function readStoredAuthSettings(profile: string): Promise<StoredAuthSettings | null> {
  try {
    const raw = await readFile(resolveProfileAuthPath(profile), "utf8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const apiBaseUrl = typeof parsed.apiBaseUrl === "string" && parsed.apiBaseUrl.trim().length > 0
      ? parsed.apiBaseUrl.trim()
      : DEFAULT_FIDE_API_BASE_URL;
    const apiKey = typeof parsed.apiKey === "string" && parsed.apiKey.trim().length > 0
      ? parsed.apiKey.trim()
      : null;
    if (!apiKey) {
      return null;
    }
    return {
      baseUrl: apiBaseUrl,
      apiKey,
    };
  } catch {
    return null;
  }
}

export async function writeStoredAuthSettings(profile: string, settings: StoredAuthSettings): Promise<void> {
  const path = resolveProfileAuthPath(profile);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify({
    apiBaseUrl: settings.baseUrl,
    apiKey: settings.apiKey,
  }, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await ensureProfileAuthPathPermissions(profile);
}

export async function clearStoredAuthSettings(profile: string): Promise<void> {
  await rm(resolveProfileAuthPath(profile), { force: true });
}

export async function resolveAuthSettings(
  flags: Map<string, string | boolean> = new Map(),
  root: string = process.cwd(),
): Promise<ResolvedAuthSettings | null> {
  const envBaseUrl = process.env.FIDE_API_BASE_URL?.trim();
  const envApiKey = process.env.FIDE_API_KEY?.trim();

  if (envApiKey) {
    return {
      baseUrl: envBaseUrl ?? DEFAULT_FIDE_API_BASE_URL,
      apiKey: envApiKey,
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
    path: resolveProfileAuthPath(profileSelection.profile),
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
