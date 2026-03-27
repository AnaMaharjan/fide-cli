import { renderHelp } from "../../util/command/help/index.js";

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
          "  fide workspace get",
        ],
      },
      {
        title: "Notes",
        items: [
          "  - Use `workspace` for shared hosted workspace inspection.",
          "  - `workspace get` resolves the workspace bound in the current project's `.fide/settings.json`.",
          "  - Hosted auth resolves from the current project account or `FIDE_ACCOUNT_ID`.",
          "  - Hosted IDs are typed: use `workspace_*` for workspaces.",
        ],
      },
    ],
  });
}
