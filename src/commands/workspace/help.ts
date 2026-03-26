import { renderHelp } from "../../util/command/help.js";

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
        ],
      },
      {
        title: "Workflows",
        items: [
          "  fide workspace list",
          "  fide workspace get --workspace workspace_<suffix>",
        ],
      },
      {
        title: "Notes",
        items: [
          "  - Use `workspace` for shared hosted workspace inspection.",
          "  - `--workspace` is optional only when `FIDE_WORKSPACE_ID` is set.",
          "  - Hosted auth resolves from the current project account or `FIDE_ACCOUNT_ID`.",
          "  - Hosted IDs are typed: use `workspace_*` for workspaces.",
        ],
      },
    ],
  });
}
