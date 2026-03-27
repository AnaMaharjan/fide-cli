import { renderHelp } from "../../util/command/help/index.js";
import { queryGetCommand } from "./get.js";
import { queryListCommand } from "./list.js";
import { queryLoadCommand } from "./load.js";
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
            `  load       ${queryLoadCommand.summary}`,
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
            "  fide query load --graph-key primary 'select * from statements limit 10' --to-fide-path results/rows.json",
            "  fide query load --file .fide/graphs/primary/queries/recentStatements.sql --to-project-path reports/rows.json",
          ],
        },
        {
          title: "Notes",
          items: [
            "  - `query list|get|save` are local-first source-of-truth commands for `.fide/graphs/<graphKey>/queries/`.",
            "  - `query load` executes against local graph/query state and writes the result to a file path.",
            "  - Query files are watched by `fide start` and synced into the workspace.",
          ],
        },
      ],
    }),
  ].join("\n");
}
