import { renderHelp } from "../../util/help.js";
import { statementsDraftCommand, statementsWriteCommand } from "./metadata.js";

export function statementsHelp(): string {
  return renderHelp({
    sections: [
      {
        title: "Usage",
        items: [
          "  fide statements <command> [flags]",
        ],
      },
      {
        title: "Commands",
        items: [
          `  write      ${statementsWriteCommand.summary}`,
          `  draft      ${statementsDraftCommand.summary}`,
        ],
      },
      {
        title: "Workflows",
        items: [
          "  fide statements write '[{ ... statement inputs ... }]'",
          "  fide statements write --file inputs.json",
          "  fide statements draft --name research-notes --file inputs.json",
        ],
      },
      {
        title: "Notes",
        items: [
          "  - `statements write` writes canonical JSONL batches into the local project `.fide` directory.",
          "  - `statements draft` creates or updates a local markdown draft from the same statement batch.",
          "  - These commands are local-only and do not target hosted workspace state directly.",
        ],
      },
    ],
  });
}
