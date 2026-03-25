import { getStringFlag } from "./args.js";
import {
  readStoredProfileSettings,
  resolveProfileSelection,
  writeStoredProfileSettings,
} from "./profile-settings.js";
import { resolveProjectPointerSettings } from "./project-pointer.js";
import { assertWorkspaceId } from "./public-ids.js";

export type WorkspaceSelectionSource = "flag" | "env" | "project" | "profile";

export type ResolvedWorkspaceSelection = {
  path: string;
  source: WorkspaceSelectionSource;
  workspaceId: string;
};

export function getWorkspaceFlag(flags: Map<string, string | boolean>): string | null {
  return getStringFlag(flags, "workspace");
}

export async function writeStoredWorkspaceSelection(profile: string, workspaceId: string | null): Promise<void> {
  const existing = await readStoredProfileSettings(profile);
  await writeStoredProfileSettings(profile, {
    ...existing,
    workspaceId: workspaceId ?? undefined,
  });
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
      workspaceId: assertWorkspaceId(flagWorkspace),
    };
  }

  const envWorkspace = process.env.FIDE_WORKSPACE_ID?.trim();
  if (envWorkspace) {
    return {
      path: "env",
      source: "env",
      workspaceId: assertWorkspaceId(envWorkspace),
    };
  }

  const projectPointer = resolveProjectPointerSettings(root);
  if (projectPointer?.workspaceId) {
    return {
      path: projectPointer.path,
      source: "project",
      workspaceId: assertWorkspaceId(projectPointer.workspaceId),
    };
  }

  const profileSelection = await resolveProfileSelection(flags, root);
  if (profileSelection) {
    const stored = await readStoredProfileSettings(profileSelection.profile);
    if (stored?.workspaceId) {
      return {
        path: profileSelection.path,
        source: "profile",
        workspaceId: assertWorkspaceId(stored.workspaceId),
      };
    }
  }

  return null;
}

export async function resolveWorkspaceSelectionOrThrow(
  flags: Map<string, string | boolean>,
): Promise<ResolvedWorkspaceSelection> {
  const selection = await resolveWorkspaceSelection(flags);
  if (!selection) {
    throw new Error("Missing workspace selection. Pass --workspace <workspace_id>, set FIDE_WORKSPACE_ID, save a workspace in the selected profile, or set project .fide/settings.json.");
  }
  return selection;
}
