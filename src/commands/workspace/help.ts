import { renderHelp } from "../../util/help.js";

export function workspaceCommandHelp(): string {
  return renderHelp({
    sections: [
      {
        title: "Usage",
        items: [
          "  fide workspace <command> [flags]",
        ],
      },
      {
        title: "Commands",
        items: [
          "  list                  List accessible workspaces",
          "  get                   Inspect a workspace by id",
          "  members               List and add workspace members",
          "  roles                 Grant and revoke workspace roles",
          "  settings              Read and write workspace-managed settings",
        ],
      },
      {
        title: "Workflows",
        items: [
          "  fide workspace list",
          "  fide workspace list --profile work",
          "  fide workspace get --workspace <workspace-id>",
          "  fide workspace members list --workspace <workspace-id>",
          "  fide workspace members add --workspace <workspace-id> --user-id <user-id> --role workspace.viewer",
          "  fide workspace roles grant --workspace <workspace-id> --user-id <user-id> --role workspace.member",
          "  fide workspace settings get --workspace <workspace-id>",
          "  fide workspace settings set --workspace <workspace-id> --file settings.json",
        ],
      },
      {
        title: "Notes",
        items: [
          "  - Use `workspace` for shared hosted state: workspaces, members, roles, and workspace settings.",
          "  - `--workspace` is optional only when `FIDE_WORKSPACE_ID` is set.",
          "  - `--profile` selects auth context; hosted workspace selection comes from `--workspace` or `FIDE_WORKSPACE_ID`.",
        ],
      },
    ],
  });
}
