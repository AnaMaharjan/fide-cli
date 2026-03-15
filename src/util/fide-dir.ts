import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

let envLoaded = false;

export function ensureFideEnvLoaded(): void {
  if (envLoaded) return;
  envLoaded = true;

  const envPaths = [
    resolve(process.cwd(), ".env"),
    resolve(process.cwd(), ".env.local"),
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

function resolveEnvFideDir(root: string): string | null {
  ensureFideEnvLoaded();
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

export function resolveFideDir(root: string = process.cwd()): string {
  return resolveEnvFideDir(root)
    ?? findNearestFideDir(root)
    ?? resolve(root, ".fide");
}

export function resolveFideRoot(root: string = process.cwd()): string {
  return dirname(resolveFideDir(root));
}

export function resolveSettingsPath(root: string = process.cwd()): string {
  return resolve(resolveFideDir(root), "settings.json");
}

export function readJsonFile<T>(path: string): T | null {
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8")) as T;
}
