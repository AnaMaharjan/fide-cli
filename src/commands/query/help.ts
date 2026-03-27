import { renderHelp } from "../../util/command/help.js";
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
            "  fide query run --graph-key primary 'select * from statements limit 10'",
            "  fide query run --file .fide/graphs/primary/queries/recentStatements.sql",
          ],
        },
        {
          title: "Notes",
          items: [
            "  - `query list|get|save` are local-first source-of-truth commands for `.fide/graphs/<graphKey>/queries/`.",
            "  - `query run` executes against local graph/query state.",
            "  - Query files are watched by `fide start` and synced into the workspace.",
          ],
        },
      ],
    }),
  ].join("\n");
}
