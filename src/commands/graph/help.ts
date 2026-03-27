import { renderHelp } from "../../util/command/help/index.js";
import { graphConnectCommand } from "./connect.js";
import { graphGetCommand } from "./get.js";
import { graphListCommand } from "./list.js";
import { graphStatusCommand } from "./status.js";

export function graphCommandHelp(): string {
  const commandSummaries = [
    { name: "status", summary: graphStatusCommand.summary },
    { name: "list", summary: graphListCommand.summary },
    { name: "get", summary: graphGetCommand.summary },
    { name: "connect", summary: graphConnectCommand.summary },
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
          "  fide graph list",
          "  fide graph connect --graph-key primary --connection '{\"type\":\"postgres\",\"url\":\"FIDE_GRAPH_DATABASE_URL\",\"schema\":\"fide_graph\"}'",
          "  fide graph connect --graph-key local --connection '{\"type\":\"sqlite\",\"fide-path\":\"graphs/local/graph.sqlite\"}'",
          "  fide graph connect --graph-key local --connection '{\"type\":\"sqlite\",\"project-path\":\"tmp/local-graph.sqlite\"}'",
          "  fide graph connect --graph-key primary --dry-run",
          "  fide graph status",
          "  fide query load --graph-key primary 'select * from statements limit 10' --to file:./rows.json",
          "  fide query save --file .fide/graphs/sqlite/queries/recentStatements.sql 'select * from statements limit 10'",
          "  fide statements draft --name research-notes --file inputs.json",
          "  fide statements guide --entity NetworkResource",
        ],
      },
      {
        title: "Notes",
        items: [
          "  - Verb model: `statements write|draft` is for local statement inputs, `query save` is for named query definitions, and `graph connect` is for local graph connection definitions.",
          "  - Local authoring commands resolve `FIDE_DIR`, the nearest `.fide` directory, then the current working directory.",
          "  - `graph list` and `graph get` default to local project graph definitions.",
          "  - `graph connect` creates or updates one graph definition in `.fide/graphs/<graphKey>/config.json`.",
          "  - `fide start` syncs shared graph metadata from `.fide/graphs/<graphKey>/config.json` into the hosted workspace.",
          "  - `graph connect --dry-run` previews the local settings change without writing it.",
          "  - Prefer the top-level `fide query ...` and `fide statements ...` surfaces for local authoring.",
        ],
      },
    ],
  });
}
