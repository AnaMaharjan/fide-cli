import { renderHelp } from "../../util/help.js";
import { graphBuildCommand, graphGetCommand, graphListCommand, graphQueryCommand, graphSaveCommand, graphStatusCommand } from "./metadata.js";

export function graphCommandHelp(): string {
  const commandSummaries = [
    { name: "statements", summary: "Write and draft local graph statements" },
    { name: "status", summary: graphStatusCommand.summary },
    { name: "list", summary: graphListCommand.summary },
    { name: "get", summary: graphGetCommand.summary },
    { name: "save", summary: graphSaveCommand.summary },
    { name: "query", summary: graphQueryCommand.summary },
    { name: "build", summary: graphBuildCommand.summary },
    { name: "defs", summary: "Inspect statement and entity definitions" },
  ];

  return renderHelp({
    sections: [
      {
        title: "Usage",
        items: [
          "  fide graph <command> [flags]",
        ],
      },
      {
        title: "Commands",
        items: commandSummaries.map(({ name, summary }) => `  ${name.padEnd(7, " ")} ${summary}`),
      },
      {
        title: "Workflows",
        items: [
          "  fide graph statements write '[{ ... statement inputs ... }]'",
          "  fide graph list",
          "  fide graph save --workspace <workspace-id> --graph combined-graph-postgres --dry-run",
          "  fide graph save --workspace <workspace-id> --graph primary --type postgres",
          "  fide graph status",
          "  fide graph query run --graph primary 'select * from statements limit 10'",
          "  fide graph query save --graph sqlite --name recentStatements 'select * from statements limit 10'",
          "  fide graph query save --workspace <workspace-id> --graph primary --name recentStatements 'select * from statements limit 10' --dry-run",
          `  ${graphBuildCommand.examples?.[1] ?? "fide graph build --graph combined"}`,
          "  fide graph statements draft --name research-notes --file inputs.json",
          "  fide graph defs",
        ],
      },
      {
        title: "Notes",
        items: [
          "  - Verb model: `statements write|draft` is for local statement inputs, `query save` is for named query definitions, and `graph save` is for hosted graph definitions.",
          "  - Local authoring commands under `statements` resolve `--fide-dir <path>`, `FIDE_DIR`, the nearest `.fide` directory, then the current working directory.",
          "  - `list`, `get`, and `save` operate on hosted workspace graphs.",
          "  - `graph save --graph <key>` will reuse the local project graph definition with the same key when available.",
          "  - `graph save` stores shared graph metadata only; local connection settings stay in project `.fide/settings.json`.",
          "  - Hosted `graph save` and hosted `graph query save` accept `--dry-run` to preview whether the write would change shared state.",
          "  - `query` covers ad hoc SQL, local saved queries, and hosted saved queries. There is no separate query draft surface.",
          "  - Author local queries with `graph query save`, validate them with `graph query run`, then publish them with hosted `graph query save`.",
          "  - Mixed `graph query` commands default to local project state.",
          "  - `graph query` only targets hosted state when `--workspace` is present.",
          "  - Pass `--workspace <workspace-id>`, or pass bare `--workspace` when `FIDE_WORKSPACE_ID` is already set.",
          "  - Hosted graph/query commands resolve auth from the current project account or `FIDE_ACCOUNT_ID`.",
        ],
      },
    ],
  });
}
