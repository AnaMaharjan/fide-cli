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
        ],
      },
      {
        title: "Workflows",
        items: [
          "  fide workspace list",
          "  fide workspace list --profile work",
          "  fide workspace get --workspace workspace_<suffix>",
          "  fide workspace members list --workspace workspace_<suffix>",
          "  fide workspace members add --workspace workspace_<suffix> --user-id user_<suffix> --role workspace.viewer --dry-run",
          "  fide workspace roles grant --workspace workspace_<suffix> --user-id user_<suffix> --role workspace.member --dry-run",
        ],
      },
      {
        title: "Notes",
        items: [
          "  - Use `workspace` for shared hosted state: workspaces, members, and roles.",
          "  - `--workspace` is optional only when `FIDE_WORKSPACE_ID` is set.",
          "  - `--profile` selects auth context; hosted workspace selection comes from `--workspace` or `FIDE_WORKSPACE_ID`.",
          "  - Hosted IDs are typed: use `workspace_*` for workspaces and `user_*` for members.",
          "  - Hosted membership and role mutations accept `--dry-run` to preview whether the change would modify shared state.",
        ],
      },
    ],
  });
}
