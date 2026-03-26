import { renderHelp } from "../../util/command/help.js";
import { queryGetCommand, queryListCommand, queryRunCommand, querySaveCommand } from "./metadata.js";

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
            "  fide query get --graph primary --name recentStatements",
            "  fide query save --graph primary --name recentStatements 'select * from statements limit 10'",
            "  fide query run --graph primary 'select * from statements limit 10'",
            "  fide query run --graph primary --name recentStatements",
            "  fide query run --workspace <workspace-id> --graph primary --name recentStatements",
          ],
        },
        {
          title: "Notes",
          items: [
            "  - `query list|get|save` are local-first source-of-truth commands for `.fide/queries/`.",
            "  - `query run` stays local by default; pass `--workspace` only when you explicitly want hosted saved-query execution.",
            "  - Query files are watched by `fide start` and synced into the workspace.",
          ],
        },
      ],
    }),
  ].join("\n");
}
