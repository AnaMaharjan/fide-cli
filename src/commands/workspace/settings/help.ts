import { renderHelp } from "../../../util/help.js";

export function workspaceSettingsHelp(): string {
  return renderHelp({
    sections: [
      {
        title: "Usage",
        items: [
          "  fide workspace settings <command> [flags]",
        ],
      },
      {
        title: "Commands",
        items: [
          "  get       Read workspace-managed settings from the API",
          "  set       Write workspace-managed settings to the API",
        ],
      },
      {
        title: "Notes",
        items: [
          "  - Use --workspace <workspace-id> to select a workspace explicitly.",
          "  - FIDE_WORKSPACE_ID provides the ambient hosted workspace when `--workspace` is omitted.",
          "  - Workspace settings commands require a hosted workspace target; they do not fall back to local project state.",
          "  - Project .fide/settings.json may still provide `profile` for auth selection.",
        ],
      },
      {
        title: "Workflows",
        items: [
          "  fide workspace settings get --workspace <workspace-id>",
          "  fide workspace settings set --workspace <workspace-id> --file settings.json",
          "  cat settings.json | fide workspace settings set --workspace <workspace-id> --stdin",
        ],
      },
    ],
  });
}
