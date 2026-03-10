import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getStringFlag } from "./args.js";

type FideSettings = {
  graphDir?: string;
};

function readSettings(root: string): FideSettings | null {
  const settingsPath = resolve(root, ".fide", "settings.json");
  if (!existsSync(settingsPath)) return null;

  const raw = readFileSync(settingsPath, "utf8");
  const parsed = JSON.parse(raw) as FideSettings;
  return parsed;
}

/**
 * Resolve the effective local .fide target directory.
 *
 * Resolution order:
 * 1. --target <path>
 * 2. cwd/.fide/settings.json -> graphDir
 * 3. cwd
 */
export function resolveFideDir(
  flags: Map<string, string | boolean>,
): { root: string; configuredFromSettings: boolean } {
  const target = getStringFlag(flags, "target");
  if (target) {
    return { root: resolve(process.cwd(), target), configuredFromSettings: false };
  }

  const cwd = process.cwd();
  const settings = readSettings(cwd);
  if (settings?.graphDir) {
    return {
      root: resolve(cwd, settings.graphDir),
      configuredFromSettings: true,
    };
  }

  return { root: cwd, configuredFromSettings: false };
}
