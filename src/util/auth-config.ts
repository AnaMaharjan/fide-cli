import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

export const DEFAULT_FIDE_BASE_URL = "https://api.fide.work";

export type StoredAuthConfig = {
  baseUrl: string;
  apiKey: string;
};

export type ResolvedAuthConfig = StoredAuthConfig & {
  source: "env" | "config";
  path: string;
};

type UserFideSettings = {
  env?: Record<string, string>;
} & Record<string, unknown>;

function resolveConfigDir(): string {
  return join(homedir(), ".fide");
}

export function resolveAuthConfigPath(): string {
  return join(resolveConfigDir(), "settings.json");
}

export async function readStoredAuthConfig(): Promise<StoredAuthConfig | null> {
  try {
    const raw = await readFile(resolveAuthConfigPath(), "utf8");
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

export async function writeStoredAuthConfig(config: StoredAuthConfig): Promise<void> {
  const path = resolveAuthConfigPath();
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
      FIDE_BASE_URL: config.baseUrl,
      FIDE_API_KEY: config.apiKey,
    },
  };

  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(next, null, 2)}\n`, "utf8");
}

export async function clearStoredAuthConfig(): Promise<void> {
  const path = resolveAuthConfigPath();
  try {
    const raw = await readFile(path, "utf8");
    const current = JSON.parse(raw) as UserFideSettings;
    const env = { ...(current.env ?? {}) };
    delete env.FIDE_BASE_URL;
    delete env.FIDE_API_KEY;

    const next: UserFideSettings = {
      ...current,
      ...(Object.keys(env).length > 0 ? { env } : {}),
    };

    if (Object.keys(next).length === 0) {
      await rm(path, { force: true });
      return;
    }

    if (!("env" in next)) {
      delete next.env;
    }

    await writeFile(path, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  } catch {
    await rm(path, { force: true });
  }
}

export async function resolveAuthConfig(): Promise<ResolvedAuthConfig | null> {
  const path = resolveAuthConfigPath();
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

  const stored = await readStoredAuthConfig();
  if (!stored) return null;

  return {
    ...stored,
    source: "config",
    path,
  };
}
