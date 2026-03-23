import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { getStringFlag } from "./args.js";
import { ensureFideEnvLoaded } from "./fide-dir.js";
import { resolveProjectPointerSettings } from "./project-pointer.js";

export type ProfileSelectionSource = "flag" | "env" | "project" | "config";

export type StoredProfileConfig = {
  defaultProfile?: string;
};

export type StoredProfileSettings = {
  workspaceId?: string;
};

export type ResolvedProfileSelection = {
  profile: string;
  source: ProfileSelectionSource;
  path: string;
};

const PROFILE_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/u;

function normalizeProfileName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!PROFILE_NAME_PATTERN.test(trimmed)) {
    throw new Error(`Invalid profile name "${trimmed}". Use letters, numbers, ".", "_" or "-".`);
  }
  return trimmed;
}

export function resolveFideConfigDir(): string {
  return join(homedir(), ".fide");
}

export function resolveGlobalConfigPath(): string {
  return join(resolveFideConfigDir(), "config.json");
}

export function resolveProfilesDir(): string {
  return join(resolveFideConfigDir(), "profiles");
}

export function resolveProfileDir(profile: string): string {
  const normalized = normalizeProfileName(profile);
  if (!normalized) {
    throw new Error("Missing profile name.");
  }
  return join(resolveProfilesDir(), normalized);
}

export function resolveProfileAuthPath(profile: string): string {
  return join(resolveProfileDir(profile), "auth.json");
}

export function resolveProfileSettingsPath(profile: string): string {
  return join(resolveProfileDir(profile), "settings.json");
}

export async function readGlobalConfig(): Promise<StoredProfileConfig | null> {
  try {
    const raw = await readFile(resolveGlobalConfigPath(), "utf8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const defaultProfile = normalizeProfileName(parsed.defaultProfile);
    return defaultProfile ? { defaultProfile } : {};
  } catch {
    return null;
  }
}

export async function writeGlobalConfig(config: StoredProfileConfig): Promise<void> {
  const next: StoredProfileConfig = {};
  const defaultProfile = normalizeProfileName(config.defaultProfile);
  const path = resolveGlobalConfigPath();
  if (!defaultProfile) {
    await rm(path, { force: true });
    return;
  }
  next.defaultProfile = defaultProfile;
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(next, null, 2)}\n`, "utf8");
}

export async function setDefaultProfile(profile: string): Promise<void> {
  const normalized = normalizeProfileName(profile);
  if (!normalized) {
    throw new Error("Missing profile name.");
  }
  await writeGlobalConfig({ defaultProfile: normalized });
}

export async function clearDefaultProfile(): Promise<void> {
  await writeGlobalConfig({});
}

export async function readStoredProfileSettings(profile: string): Promise<StoredProfileSettings | null> {
  try {
    const raw = await readFile(resolveProfileSettingsPath(profile), "utf8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const workspaceId = typeof parsed.workspaceId === "string" && parsed.workspaceId.trim().length > 0
      ? parsed.workspaceId.trim()
      : null;
    return workspaceId ? { workspaceId } : {};
  } catch {
    return null;
  }
}

export async function writeStoredProfileSettings(profile: string, settings: StoredProfileSettings): Promise<void> {
  const normalized = normalizeProfileName(profile);
  if (!normalized) {
    throw new Error("Missing profile name.");
  }
  const next: StoredProfileSettings = {};
  if (typeof settings.workspaceId === "string" && settings.workspaceId.trim().length > 0) {
    next.workspaceId = settings.workspaceId.trim();
  }

  const path = resolveProfileSettingsPath(normalized);
  if (Object.keys(next).length === 0) {
    await rm(path, { force: true });
    return;
  }

  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(next, null, 2)}\n`, "utf8");
}

export async function resolveProfileSelection(
  flags: Map<string, string | boolean>,
  root: string = process.cwd(),
): Promise<ResolvedProfileSelection | null> {
  ensureFideEnvLoaded();

  const flagProfile = normalizeProfileName(getStringFlag(flags, "profile"));
  if (flagProfile) {
    return {
      profile: flagProfile,
      source: "flag",
      path: resolveProfileAuthPath(flagProfile),
    };
  }

  const envProfile = normalizeProfileName(process.env.FIDE_PROFILE);
  if (envProfile) {
    return {
      profile: envProfile,
      source: "env",
      path: resolveProfileAuthPath(envProfile),
    };
  }

  const projectPointer = resolveProjectPointerSettings(root);
  if (projectPointer?.profile) {
    return {
      profile: projectPointer.profile,
      source: "project",
      path: projectPointer.path,
    };
  }

  const config = await readGlobalConfig();
  const defaultProfile = normalizeProfileName(config?.defaultProfile);
  if (defaultProfile) {
    return {
      profile: defaultProfile,
      source: "config",
      path: resolveGlobalConfigPath(),
    };
  }

  return null;
}

export async function clearStoredProfileSettings(profile: string): Promise<void> {
  const normalized = normalizeProfileName(profile);
  if (!normalized) {
    throw new Error("Missing profile name.");
  }
  await rm(resolveProfileSettingsPath(normalized), { force: true });
}

export async function ensureProfileAuthPathPermissions(profile: string): Promise<void> {
  await chmod(resolveProfileAuthPath(profile), 0o600);
}

export function getProfileNotFoundError(profile: string): Error {
  return new Error(`Profile "${profile}" not found. Run \`fide login --profile ${profile}\`.`);
}
