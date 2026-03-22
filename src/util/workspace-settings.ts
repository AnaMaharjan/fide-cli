import { getStringFlag } from "./args.js";
import { readStoredAuthSettings } from "./auth-settings.js";
import {
  readStoredProfileSettings,
  resolveProfileSelection,
  resolveProfileSettingsPath,
  writeStoredProfileSettings,
  getProfileNotFoundError,
} from "./profile-settings.js";
import { resolveProjectPointerSettings } from "./project-pointer.js";

export type WorkspaceSelectionSource = "flag" | "env" | "project" | "profile";

export type ResolvedWorkspaceSelection = {
  path: string;
  source: WorkspaceSelectionSource;
  workspaceId: string;
};

export function getWorkspaceFlag(flags: Map<string, string | boolean>): string | null {
  return getStringFlag(flags, "workspace");
}

export async function readStoredWorkspaceSelection(profile: string): Promise<string | null> {
  const stored = await readStoredProfileSettings(profile);
  return typeof stored?.workspaceId === "string" && stored.workspaceId.trim().length > 0
    ? stored.workspaceId.trim()
    : null;
}

export async function writeStoredWorkspaceSelection(profile: string, workspaceId: string | null): Promise<void> {
  await writeStoredProfileSettings(profile, { workspaceId: workspaceId ?? undefined });
}

export async function resolveWorkspaceSelection(
  flags: Map<string, string | boolean>,
  root: string = process.cwd(),
): Promise<ResolvedWorkspaceSelection | null> {
  const flagWorkspace = getWorkspaceFlag(flags);
  if (flagWorkspace) {
    return {
      path: "--workspace",
      source: "flag",
      workspaceId: flagWorkspace,
    };
  }

  const envWorkspace = process.env.FIDE_WORKSPACE?.trim();
  if (envWorkspace) {
    return {
      path: "env",
      source: "env",
      workspaceId: envWorkspace,
    };
  }

  const projectPointer = resolveProjectPointerSettings(root);
  if (projectPointer?.workspaceId) {
    return {
      path: projectPointer.path,
      source: "project",
      workspaceId: projectPointer.workspaceId,
    };
  }

  const profileSelection = await resolveProfileSelection(flags, root);
  if (!profileSelection) {
    return null;
  }

  const storedWorkspace = await readStoredWorkspaceSelection(profileSelection.profile);
  if (storedWorkspace) {
    return {
      path: resolveProfileSettingsPath(profileSelection.profile),
      source: "profile",
      workspaceId: storedWorkspace,
    };
  }

  return null;
}

export async function resolveWorkspaceSelectionOrThrow(
  flags: Map<string, string | boolean>,
  root: string = process.cwd(),
): Promise<ResolvedWorkspaceSelection> {
  const profileSelection = await resolveProfileSelection(flags, root);
  if (profileSelection) {
    const storedAuth = await readStoredAuthSettings(profileSelection.profile);
    if (!storedAuth && profileSelection.source === "project") {
      throw getProfileNotFoundError(profileSelection.profile);
    }
  }

  const selection = await resolveWorkspaceSelection(flags, root);
  if (!selection) {
    throw new Error("Missing workspace selection. Pass --workspace <workspace-id>, set FIDE_WORKSPACE, save `workspaceId` in project .fide/settings.json, or save it in the selected profile settings.");
  }
  return selection;
}
