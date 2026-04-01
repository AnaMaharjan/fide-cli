import { renderHelp } from "../../util/command/help/index.js";
import { queryGetCommand } from "./get.js";
import { queryListCommand } from "./list.js";
import { queryRunCommand } from "./run.js";
import { querySaveCommand } from "./save.js";

export function queryCommandHelp(): string {
  return [
    renderHelp({
      sections: [
        {
          title: "Usage",
          items: [
            "  fide query <command> [flags]",
          ],
        },
        {
          title: "Commands",
          items: [
            `  run        ${queryRunCommand.summary}`,
            `  list       ${queryListCommand.summary}`,
            `  get        ${queryGetCommand.summary}`,
            `  save       ${querySaveCommand.summary}`,
          ],
        },
        {
          title: "Workflows",
          items: [
            "  fide query list",
            "  fide query get --file .fide/graphs/primary/queries/recentStatements.sql",
            "  fide query save --file .fide/graphs/primary/queries/recentStatements.sql 'select * from statements limit 10'",
            "  fide query run --from-graph-key primary 'select * from statements limit 10' --to-fide-path results/rows.json",
            "  fide query run --from-graph-key primary --file .fide/graphs/primary/queries/recentStatements.sql --to-project-path reports/rows.json",
            "  fide query run --from-fide-path graphs/sqlite-test/query-results/queries.sqlite 'select * from entity_anchors_0 limit 10' --to-project-path reports/rows.json",
          ],
        },
        {
          title: "Notes",
          items: [
            "  - `query list|get|save` are local-first source-of-truth commands for `.fide/graphs/<graphKey>/queries/`.",
            "  - `query run` executes against either a configured graph or a direct sqlite input source and writes the result to a file path.",
            "  - `.sqlite` query output writes into a table named after the saved query file.",
            "  - Query files are watched by `fide start` and synced into the workspace.",
          ],
        },
      ],
    }),
  ].join("\n");
}
