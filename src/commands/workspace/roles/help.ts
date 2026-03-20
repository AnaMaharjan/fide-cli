import { renderHelp } from "../../../util/help.js";

export function workspaceRolesHelp(): string {
  return renderHelp({
    sections: [
      {
        title: "Usage",
        items: [
          "  fide workspace roles <command> [flags]",
        ],
      },
      {
        title: "Commands",
        items: [
          "  grant      Grant a role to an existing workspace member",
          "  revoke     Revoke a role from an existing workspace member",
        ],
      },
    ],
  });
}
