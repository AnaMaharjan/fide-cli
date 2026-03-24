import { renderHelp } from "../../../util/help.js";

export function workspaceMembersHelp(): string {
  return renderHelp({
    sections: [
      {
        title: "Usage",
        items: [
          "  fide workspace members <command> [flags]",
        ],
      },
      {
        title: "Commands",
        items: [
          "  list       List members for a workspace",
          "  add        Add a member to a workspace with an initial role",
        ],
      },
      {
        title: "Workflows",
        items: [
          "  fide workspace members list --workspace <workspace-id>",
          "  fide workspace members add --workspace <workspace-id> --user-id <user-id> --role member",
        ],
      },
    ],
  });
}
