import { renderHelp } from "../../../util/help.js";

export function workspaceServiceAccountsHelp(): string {
  return renderHelp({
    sections: [
      {
        title: "Usage",
        items: [
          "  fide workspace service-accounts <command> [flags]",
        ],
      },
      {
        title: "Commands",
        items: [
          "  create     Create a workspace-managed service account",
        ],
      },
    ],
  });
}
