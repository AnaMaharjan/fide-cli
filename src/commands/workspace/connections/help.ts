import { renderHelp } from "../../../util/help.js";

export function workspaceConnectionsHelp(): string {
  return renderHelp({
    sections: [
      {
        title: "Usage",
        items: [
          "  fide workspace connections <command> [flags]",
        ],
      },
      {
        title: "Commands",
        items: [
          "  list       List workspace connection metadata",
          "  create     Create workspace connection metadata",
        ],
      },
      {
        title: "Notes",
        items: [
          "  - Use --workspace <workspace-id> to select a workspace explicitly.",
          "  - create accepts either --connection or --secret-id.",
          "  - When --connection is used, the API stores the secret in Vault and returns the resulting secret id.",
          "  - Workspace settings should reference these connections via connectionRef rather than raw secrets.",
        ],
      },
    ],
  });
}
