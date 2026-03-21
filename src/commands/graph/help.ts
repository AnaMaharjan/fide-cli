import { renderHelp } from "../../util/help.js";
import { graphBuildCommand, graphDraftCommand, graphGetCommand, graphListCommand, graphQueryCommand, graphSaveCommand, graphStatusCommand } from "./metadata.js";

export function graphCommandHelp(): string {
  const commandSummaries = [
    { name: "statements", summary: "Write statement inputs into a local .fide directory" },
    { name: "draft", summary: graphDraftCommand.summary },
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
          "  fide graph list --workspace <workspace-id>",
          "  fide graph save --workspace <workspace-id> --graph primary --type postgres --schema fide_graph --connection-ref primary-graph",
          "  fide graph status",
          "  fide graph query run --graph primary 'select * from statements limit 10'",
          "  fide graph query save --graph sqlite --name recentStatements 'select * from statements limit 10'",
          "  fide graph query save --workspace <workspace-id> --graph primary --name recentStatements 'select * from statements limit 10'",
          `  ${graphBuildCommand.examples?.[1] ?? "fide graph build --graph combined"}`,
          "  fide graph draft --file inputs.json",
          "  fide graph defs",
        ],
      },
      {
        title: "Notes",
        items: [
          "  - Local authoring commands (`statements write`, `draft`) resolve `--fide-dir <path>`, `FIDE_DIR`, the nearest `.fide` directory, then the current working directory.",
          "  - `status` shows local graph status by default and can target configured runtime backends with `--graph` or `--query-catalog`.",
          "  - `list`, `get`, and `save` operate on hosted workspace graphs.",
          "  - `query` is the single namespace for ad hoc SQL, local saved queries, and hosted saved queries.",
          "  - Runtime commands (`query`, `build`) operate on configured graphs and query stores.",
        ],
      },
    ],
  });
}
