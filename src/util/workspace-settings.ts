import { getStringFlag } from "./args.js";
import {
  writeStoredProfileSettings,
} from "./profile-settings.js";

export type WorkspaceSelectionSource = "flag" | "env";

export type ResolvedWorkspaceSelection = {
  path: string;
  source: WorkspaceSelectionSource;
  workspaceId: string;
};

export function getWorkspaceFlag(flags: Map<string, string | boolean>): string | null {
  return getStringFlag(flags, "workspace");
}

export async function writeStoredWorkspaceSelection(profile: string, workspaceId: string | null): Promise<void> {
  await writeStoredProfileSettings(profile, { workspaceId: workspaceId ?? undefined });
}

export async function resolveWorkspaceSelection(
  flags: Map<string, string | boolean>,
): Promise<ResolvedWorkspaceSelection | null> {
  const flagWorkspace = getWorkspaceFlag(flags);
  if (flagWorkspace) {
    return {
      path: "--workspace",
      source: "flag",
      workspaceId: flagWorkspace,
    };
  }

  const envWorkspace = process.env.FIDE_WORKSPACE_ID?.trim();
  if (envWorkspace) {
    return {
      path: "env",
      source: "env",
      workspaceId: envWorkspace,
    };
  }

  return null;
}

export async function resolveWorkspaceSelectionOrThrow(
  flags: Map<string, string | boolean>,
): Promise<ResolvedWorkspaceSelection> {
  const selection = await resolveWorkspaceSelection(flags);
  if (!selection) {
    throw new Error("Missing workspace selection. Pass --workspace <workspace_id> or set FIDE_WORKSPACE_ID.");
  }
  return selection;
}
