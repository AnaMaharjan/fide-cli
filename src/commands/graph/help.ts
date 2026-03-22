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
          "  fide graph list --profile work",
          "  fide graph save --profile work --graph primary --type postgres --schema fide_graph --connection-ref primary-graph",
          "  fide graph status",
          "  fide graph query run --graph primary 'select * from statements limit 10'",
          "  fide graph query save --graph sqlite --name recentStatements 'select * from statements limit 10'",
          "  fide graph query save --profile work --graph primary --name recentStatements 'select * from statements limit 10'",
          `  ${graphBuildCommand.examples?.[1] ?? "fide graph build --graph combined"}`,
          "  fide graph draft --file inputs.json",
          "  fide graph defs",
        ],
      },
      {
        title: "Notes",
        items: [
          "  - Local authoring commands (`statements write`, `draft`) resolve `--fide-dir <path>`, `FIDE_DIR`, the nearest `.fide` directory, then the current working directory.",
          "  - `list`, `get`, and `save` operate on hosted workspace graphs.",
          "  - `query` covers ad hoc SQL, local saved queries, and hosted saved queries.",
          "  - Hosted graph/query commands accept `--profile` and can also resolve from project `.fide/settings.json`.",
        ],
      },
    ],
  });
}
