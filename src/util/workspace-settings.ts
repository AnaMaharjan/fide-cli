import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { getStringFlag } from "./args.js";
import { resolveAuthSettingsPath } from "./auth-settings.js";

type UserFideSettings = {
  env?: Record<string, string>;
  workspace?: string;
} & Record<string, unknown>;

export type WorkspaceSelectionSource = "flag" | "env" | "settings";

export type ResolvedWorkspaceSelection = {
  path: string;
  source: WorkspaceSelectionSource;
  workspaceId: string;
};

function resolveWorkspaceSettingsPath(): string {
  return resolveAuthSettingsPath();
}

async function readStoredSettings(): Promise<UserFideSettings | null> {
  try {
    const raw = await readFile(resolveWorkspaceSettingsPath(), "utf8");
    return JSON.parse(raw) as UserFideSettings;
  } catch {
    return null;
  }
}

export async function readStoredWorkspaceSelection(): Promise<string | null> {
  const stored = await readStoredSettings();
  const workspace = stored?.workspace;
  return typeof workspace === "string" && workspace.trim().length > 0
    ? workspace.trim()
    : null;
}

export async function writeStoredWorkspaceSelection(workspaceId: string | null): Promise<void> {
  const path = resolveWorkspaceSettingsPath();
  let current: UserFideSettings = {};
  try {
    const raw = await readFile(path, "utf8");
    current = JSON.parse(raw) as UserFideSettings;
  } catch {
    current = {};
  }

  if (workspaceId?.trim()) {
    current.workspace = workspaceId.trim();
  } else {
    delete current.workspace;
  }

  if (Object.keys(current).length === 0) {
    await rm(path, { force: true });
    return;
  }

  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(current, null, 2)}\n`, "utf8");
}

export function getWorkspaceFlag(flags: Map<string, string | boolean>): string | null {
  return getStringFlag(flags, "workspace");
}

export async function resolveWorkspaceSelection(flags: Map<string, string | boolean>): Promise<ResolvedWorkspaceSelection | null> {
  const flagWorkspace = getWorkspaceFlag(flags);
  if (flagWorkspace) {
    return {
      path: resolveWorkspaceSettingsPath(),
      source: "flag",
      workspaceId: flagWorkspace,
    };
  }

  const envWorkspace = process.env.FIDE_WORKSPACE?.trim();
  if (envWorkspace) {
    return {
      path: resolveWorkspaceSettingsPath(),
      source: "env",
      workspaceId: envWorkspace,
    };
  }

  const storedWorkspace = await readStoredWorkspaceSelection();
  if (storedWorkspace) {
    return {
      path: resolveWorkspaceSettingsPath(),
      source: "settings",
      workspaceId: storedWorkspace,
    };
  }

  return null;
}

export async function resolveWorkspaceSelectionOrThrow(flags: Map<string, string | boolean>): Promise<ResolvedWorkspaceSelection> {
  const selection = await resolveWorkspaceSelection(flags);
  if (!selection) {
    throw new Error("Missing workspace selection. Pass --workspace <workspace-id>, set FIDE_WORKSPACE, or save `workspace` in ~/.fide/settings.json.");
  }
  return selection;
}
