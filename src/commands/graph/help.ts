import { renderHelp } from "../../util/command/help.js";
import { graphBuildCommand } from "./build.js";
import { graphGetCommand } from "./get.js";
import { graphListCommand } from "./list.js";
import { graphSaveCommand } from "./save.js";
import { graphStatusCommand } from "./status.js";

export function graphCommandHelp(): string {
  const commandSummaries = [
    { name: "status", summary: graphStatusCommand.summary },
    { name: "list", summary: graphListCommand.summary },
    { name: "get", summary: graphGetCommand.summary },
    { name: "save", summary: graphSaveCommand.summary },
    { name: "build", summary: graphBuildCommand.summary },
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
          "  fide graph save --graph combined-graph-postgres --dry-run",
          "  fide graph save --graph primary --type postgres",
          "  fide graph status",
          "  fide query run --graph primary 'select * from statements limit 10'",
          "  fide query save --graph sqlite --name recentStatements 'select * from statements limit 10'",
          `  ${graphBuildCommand.examples?.[1] ?? "fide graph build --graph combined"}`,
          "  fide statements draft --name research-notes --file inputs.json",
          "  fide statements guide --entity NetworkResource",
        ],
      },
      {
        title: "Notes",
        items: [
          "  - Verb model: `statements write|draft` is for local statement inputs, `query save` is for named query definitions, and `graph save` is for hosted graph metadata.",
          "  - Local authoring commands under `statements` resolve `--fide-dir <path>`, `FIDE_DIR`, the nearest `.fide` directory, then the current working directory.",
          "  - `graph list` and `graph get` default to local project graph definitions.",
          "  - `graph save --graph <key>` will reuse the local project graph definition with the same key when available.",
          "  - `graph save` projects shared graph metadata only into the workspace bound in project settings; local connection settings stay in project `.fide/settings.json`.",
          "  - `fide start` uses the same projection model when syncing local graphs into the hosted workspace.",
          "  - Hosted `graph save` accepts `--dry-run` to preview whether the write would change shared state.",
          "  - Prefer the top-level `fide query ...` and `fide statements ...` surfaces for local authoring.",
          "  - Hosted graph commands resolve auth from the current project account.",
        ],
      },
    ],
  });
}
