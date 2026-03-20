import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

export const DEFAULT_FIDE_BASE_URL = "https://api.fide.work";

export type StoredAuthSettings = {
  baseUrl: string;
  apiKey: string;
};

export type ResolvedAuthSettings = StoredAuthSettings & {
  source: "env" | "settings";
  path: string;
};

type UserFideSettings = {
  env?: Record<string, string>;
} & Record<string, unknown>;

function resolveConfigDir(): string {
  return join(homedir(), ".fide");
}

export function resolveAuthSettingsPath(): string {
  return join(resolveConfigDir(), "settings.json");
}

export async function readStoredAuthSettings(): Promise<StoredAuthSettings | null> {
  try {
    const raw = await readFile(resolveAuthSettingsPath(), "utf8");
    const parsed = JSON.parse(raw) as UserFideSettings;
    const env = parsed.env;
    if (!env || typeof env !== "object") {
      return null;
    }
    const baseUrl = typeof env.FIDE_BASE_URL === "string" ? env.FIDE_BASE_URL : DEFAULT_FIDE_BASE_URL;
    const apiKey = typeof env.FIDE_API_KEY === "string" ? env.FIDE_API_KEY : null;
    if (!apiKey) {
      return null;
    }
    return {
      baseUrl,
      apiKey,
    };
  } catch {
    return null;
  }
}

export async function writeStoredAuthSettings(settings: StoredAuthSettings): Promise<void> {
  const path = resolveAuthSettingsPath();
  let current: UserFideSettings = {};
  try {
    const raw = await readFile(path, "utf8");
    current = JSON.parse(raw) as UserFideSettings;
  } catch {
    current = {};
  }

  const next: UserFideSettings = {
    ...current,
    env: {
      ...(current.env ?? {}),
      FIDE_BASE_URL: settings.baseUrl,
      FIDE_API_KEY: settings.apiKey,
    },
  };

  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(next, null, 2)}\n`, "utf8");
}

export async function clearStoredAuthSettings(): Promise<void> {
  const path = resolveAuthSettingsPath();
  try {
    const raw = await readFile(path, "utf8");
    const current = JSON.parse(raw) as UserFideSettings;
    const env = { ...(current.env ?? {}) };
    delete env.FIDE_BASE_URL;
    delete env.FIDE_API_KEY;

    const { env: _ignoredEnv, ...rest } = current;
    const next: UserFideSettings = Object.keys(env).length > 0
      ? { ...rest, env }
      : rest;

    if (Object.keys(next).length === 0) {
      await rm(path, { force: true });
      return;
    }

    await writeFile(path, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  } catch {
    await rm(path, { force: true });
  }
}

export async function resolveAuthSettings(): Promise<ResolvedAuthSettings | null> {
  const path = resolveAuthSettingsPath();
  const envBaseUrl = process.env.FIDE_BASE_URL?.trim();
  const envApiKey = process.env.FIDE_API_KEY?.trim();

  if (envApiKey) {
    return {
      baseUrl: envBaseUrl ?? DEFAULT_FIDE_BASE_URL,
      apiKey: envApiKey,
      source: "env",
      path,
    };
  }

  const stored = await readStoredAuthSettings();
  if (!stored) return null;

  return {
    ...stored,
    source: "settings",
    path,
  };
}
