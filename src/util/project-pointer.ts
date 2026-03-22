import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

export type ProjectPointerSettings = {
  path: string;
  root: string;
  profile: string | null;
  workspaceId: string | null;
};

function normalizeString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

export function resolveProjectPointerSettings(root: string = process.cwd()): ProjectPointerSettings | null {
  const machineSettingsPath = resolve(homedir(), ".fide", "settings.json");
  let current = resolve(root);

  while (true) {
    const candidate = join(current, ".fide", "settings.json");
    if (candidate !== machineSettingsPath && existsSync(candidate)) {
      const raw = readFileSync(candidate, "utf8");
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      return {
        path: candidate,
        root: current,
        profile: normalizeString(parsed.profile),
        workspaceId: normalizeString(parsed.workspaceId),
      };
    }

    if (existsSync(join(current, ".git"))) {
      return null;
    }

    const parent = dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}
