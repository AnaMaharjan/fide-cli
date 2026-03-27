import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

let envLoaded = false;

export type FideDirResolution = {
  fideDir: string;
  root: string;
  source: string;
};

function loadEnvFiles(root: string): void {
  const envPaths = [
    resolve(root, ".env"),
    resolve(root, ".env.local"),
  ];

  for (const envPath of envPaths) {
    if (!existsSync(envPath)) continue;
    try {
      process.loadEnvFile(envPath);
    } catch {
      // Ignore malformed env files; explicit process.env still wins.
    }
  }
}

function resolveEnvFideDirWithoutLoading(root: string): string | null {
  const configured = process.env.FIDE_DIR;
  if (!configured) return null;
  return configured.startsWith("/")
    ? configured
    : resolve(root, configured);
}

function findNearestFideDir(root: string): string | null {
  let current = resolve(root);
  while (true) {
    const candidate = resolve(current, ".fide");
    if (existsSync(candidate)) {
      return candidate;
    }
    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

export function ensureFideEnvLoaded(): void {
  if (envLoaded) return;
  envLoaded = true;

  const cwd = process.cwd();
  loadEnvFiles(cwd);

  const resolvedFideDir = resolveEnvFideDirWithoutLoading(cwd)
    ?? findNearestFideDir(cwd)
    ?? resolve(cwd, ".fide");
  const resolvedFideRoot = dirname(resolvedFideDir);
  if (resolvedFideRoot !== resolve(cwd)) {
    loadEnvFiles(resolvedFideRoot);
  }
}

function resolveEnvSourcePath(root: string): string | null {
  const envPaths = [
    resolve(root, ".env.local"),
    resolve(root, ".env"),
  ];

  for (const envPath of envPaths) {
    if (!existsSync(envPath)) continue;
    try {
      const contents = readFileSync(envPath, "utf8");
      for (const line of contents.split(/\r?\n/u)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        if (/^(?:export\s+)?FIDE_DIR\s*=/u.test(trimmed)) {
          return envPath;
        }
      }
    } catch {
      // Ignore unreadable env files; explicit process.env still wins.
    }
  }

  return null;
}

function resolveEnvFideDir(root: string): string | null {
  ensureFideEnvLoaded();
  return resolveEnvFideDirWithoutLoading(root);
}

export function resolveFideDir(root: string = process.cwd()): string {
  return resolveEnvFideDir(root)
    ?? findNearestFideDir(root)
    ?? resolve(root, ".fide");
}

export function resolveFideContext(root: string = process.cwd()): FideDirResolution {
  const envFideDir = resolveEnvFideDir(root);
  if (envFideDir) {
    return {
      fideDir: envFideDir,
      root: dirname(envFideDir),
      source: resolveEnvSourcePath(root) ?? "env",
    };
  }

  const nearestFideDir = findNearestFideDir(root);
  if (nearestFideDir) {
    return {
      fideDir: nearestFideDir,
      root: dirname(nearestFideDir),
      source: nearestFideDir,
    };
  }

  const fideDir = resolve(root, ".fide");
  return {
    fideDir,
    root: dirname(fideDir),
    source: fideDir,
  };
}

export function resolveFideRoot(root: string = process.cwd()): string {
  return dirname(resolveFideDir(root));
}

export function resolveSettingsPath(root: string = process.cwd()): string {
  return resolve(resolveFideDir(root), "settings.json");
}

export function resolveGraphsDir(root: string = process.cwd()): string {
  return resolve(resolveFideDir(root), "graphs");
}

export function resolveGraphConfigPath(graphKey: string, root: string = process.cwd()): string {
  return resolve(resolveGraphsDir(root), graphKey, "config.json");
}

export function readJsonFile<T>(path: string): T | null {
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8")) as T;
}
