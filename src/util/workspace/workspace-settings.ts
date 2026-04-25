import { resolveProjectPointerSettings } from "../../lib/project/config/project-pointer.js";
import { assertWorkspaceId } from "../ids/public-ids.js";

export type WorkspaceSelectionSource = "project";

export type ResolvedWorkspaceSelection = {
  path: string;
  source: WorkspaceSelectionSource;
  workspaceId: string;
};

export async function resolveWorkspaceSelection(
  root: string = process.cwd(),
): Promise<ResolvedWorkspaceSelection | null> {
  const projectPointer = resolveProjectPointerSettings(root);
  if (projectPointer?.workspaceId) {
    return {
      path: projectPointer.path,
      source: "project",
      workspaceId: assertWorkspaceId(projectPointer.workspaceId),
    };
  }

  return null;
}

export async function resolveWorkspaceSelectionOrThrow(
  root: string = process.cwd(),
): Promise<ResolvedWorkspaceSelection> {
  const selection = await resolveWorkspaceSelection(root);
  if (!selection) {
    throw new Error("Missing workspace selection. Set FIDE_DIR/_meta.json with workspace.id or run `fide login`.");
  }
  return selection;
}
