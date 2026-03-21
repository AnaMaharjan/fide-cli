import { renderHelp } from "../../util/help.js";
import { graphBuildCommand, graphDraftCommand, graphQueryCommand, graphStatusCommand } from "./metadata.js";

export function graphCommandHelp(): string {
  const commandSummaries = [
    { name: "write", summary: "Write statement inputs into a local .fide directory" },
    { name: "draft", summary: graphDraftCommand.summary },
    { name: "status", summary: graphStatusCommand.summary },
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
          "  fide graph write '[{ ... statement inputs ... }]'",
          "  fide graph query write --graph sqlite --name recentStatements 'select * from statements limit 10'",
          "  fide graph status",
          `  ${graphQueryCommand.examples?.[0] ?? "fide graph query --graph primary 'select * from statements limit 10'"}`,
          `  ${graphBuildCommand.examples?.[1] ?? "fide graph build --graph combined"}`,
          "  fide graph draft --file inputs.json",
          "  fide graph defs",
        ],
      },
      {
        title: "Notes",
        items: [
          "  - Local authoring commands (`write`, `draft`) resolve `--fide-dir <path>`, `FIDE_DIR`, the nearest `.fide` directory, then the current working directory.",
          "  - `status` shows local graph status by default and can target configured runtime backends with `--graph` or `--query-store`.",
          "  - `query` executes ad hoc graph queries, and `query write` saves local query definitions.",
          "  - Runtime commands (`query`, `build`) operate on configured statement stores and query stores.",
        ],
      },
    ],
  });
}
