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
          "  settings              Read and write workspace-managed settings",
          "  connections           List and create workspace connection metadata",
          "  queries               List and inspect hosted workspace queries",
        ],
      },
      {
        title: "Workflows",
        items: [
          "  fide workspace list",
          "  fide workspace get --workspace <workspace-id>",
          "  fide workspace members --workspace <workspace-id>",
          "  fide workspace members add --workspace <workspace-id> --user-id <user-id> --role workspace.viewer",
          "  fide workspace roles grant --workspace <workspace-id> --user-id <user-id> --role workspace.member",
          "  fide workspace service-accounts create --workspace <workspace-id> --label 'build bot' --role workspace.member",
          "  fide workspace settings get --workspace <workspace-id>",
          "  fide workspace settings set --workspace <workspace-id> --file settings.json",
          "  fide workspace connections list --workspace <workspace-id>",
          "  fide workspace connections create --workspace <workspace-id> --slug primary-graph --kind postgres --connection '$DATABASE_URL'",
          "  fide workspace queries list --workspace <workspace-id>",
          "  fide workspace queries get --workspace <workspace-id> --graph primary --name recent_entities",
        ],
      },
      {
        title: "Notes",
        items: [
          "  - Use `graph` for local .fide authoring and local-first workflows.",
          "  - Use `workspace` for shared hosted state, access control, settings, connections, hosted graphs, and hosted queries.",
          "  - Prefer --workspace for explicit cloud context. FIDE_WORKSPACE and saved machine settings are fallbacks.",
        ],
      },
    ],
  });
}
