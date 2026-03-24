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
          "  - FIDE_WORKSPACE overrides project and profile workspace defaults.",
          "  - Project .fide/settings.json may provide `workspaceId` and `profile` pointer fields.",
          "  - Profile workspace defaults live in ~/.fide/profiles/<name>/settings.json.",
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
