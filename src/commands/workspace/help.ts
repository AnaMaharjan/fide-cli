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
          "  members               List members for a workspace",
          "  roles                 Grant and revoke workspace roles",
          "  service-accounts      Create workspace-managed service accounts",
        ],
      },
      {
        title: "Workflows",
        items: [
          "  fide workspace list",
          "  fide workspace get --id <workspace-id>",
          "  fide workspace members --id <workspace-id>",
          "  fide workspace members add --workspace-id <workspace-id> --user-id <user-id> --role workspace.viewer",
          "  fide workspace roles grant --workspace-id <workspace-id> --user-id <user-id> --role workspace.member",
          "  fide workspace service-accounts create --workspace-id <workspace-id> --label 'build bot' --role workspace.member",
        ],
      },
    ],
  });
}
