import { renderHelp } from "../../../util/help.js";

export function workspaceQueriesHelp(): string {
  return renderHelp({
    sections: [
      {
        title: "Usage",
        items: [
          "  fide workspace queries <command> [flags]",
        ],
      },
      {
        title: "Commands",
        items: [
          "  list       List hosted queries for a workspace",
          "  get        Get a hosted query by statement store key and name",
          "  run        Execute a hosted saved query against the workspace graph store",
        ],
      },
      {
        title: "Notes",
        items: [
          "  - Use --workspace <workspace-id> to select a workspace explicitly.",
          "  - Use --query-store <key> when a workspace has more than one hosted query store configured.",
          "  - Use --limit <n> to cap execution result size on run.",
          "  - Hosted queries use the same canonical query shape as local saved queries, without local file metadata.",
          "  - Hosted execution is read-only. Saved queries must resolve to SELECT, WITH, EXPLAIN, or VALUES SQL.",
        ],
      },
    ],
  });
}
