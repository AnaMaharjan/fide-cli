import { renderHelp } from "../../util/help.js";
import { graphBuildCommand, graphDraftCommand, graphSqlCommand, graphStatusCommand, graphStoresCommand } from "./metadata.js";

export function graphCommandHelp(): string {
  const commandSummaries = [
    { name: "write", summary: "Write statement inputs into a local .fide directory" },
    { name: "draft", summary: graphDraftCommand.summary },
    { name: "status", summary: graphStatusCommand.summary },
    { name: "stores", summary: graphStoresCommand.summary },
    { name: "sql", summary: graphSqlCommand.summary },
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
          "  fide graph write '[{ ... statement inputs ... }]'",
          "  fide graph write --query --store sqlite --name recentStatements 'select * from statements limit 10'",
          graphStoresCommand.usage[0],
          graphSqlCommand.examples?.[0] ?? "  fide graph sql --store primary 'select * from statements limit 10'",
          graphBuildCommand.examples?.[1] ?? "  fide graph build --statements combined",
          "  fide graph draft --file inputs.json",
          "  fide graph defs",
        ],
      },
      {
        title: "Notes",
        items: [
          "  - Local authoring commands (`write`, `draft`, `status`) resolve `--fide-dir <path>`, `FIDE_DIR`, the nearest `.fide` directory, then the current working directory.",
          "  - Runtime commands (`stores`, `sql`, `build`) operate on configured statement stores and query stores.",
        ],
      },
    ],
  });
}
