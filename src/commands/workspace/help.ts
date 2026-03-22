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
          "  settings              Read and write workspace-managed settings",
        ],
      },
      {
        title: "Workflows",
        items: [
          "  fide workspace list",
          "  fide workspace list --profile work",
          "  fide workspace get --workspace <workspace-id>",
          "  fide workspace members list --workspace <workspace-id>",
          "  fide workspace members add --workspace <workspace-id> --user-id <user-id> --role workspace.viewer",
          "  fide workspace roles grant --workspace <workspace-id> --user-id <user-id> --role workspace.member",
          "  fide workspace settings get --workspace <workspace-id>",
          "  fide workspace settings set --workspace <workspace-id> --file settings.json",
        ],
      },
      {
        title: "Notes",
        items: [
          "  - Use `graph` for graph authoring, graph runtime access, hosted graph configuration, and saved-query workflows.",
          "  - Use `workspace` for shared hosted state, access control, agents, and settings.",
          "  - Prefer --workspace for explicit cloud context. FIDE_WORKSPACE, project settings, and profile settings are fallbacks.",
          "  - Use --profile or FIDE_PROFILE to select which machine profile authenticates the command.",
          "  - A default profile is optional. Project settings or explicit flags can fully determine hosted context.",
        ],
      },
    ],
  });
}
