import { renderHelp } from "../../util/command/help.js";
import { statementsDraftCommand } from "./draft.js";
import { statementsGuideCommand } from "./guide.js";
import { statementsWriteCommand } from "./write.js";

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
          `  guide      ${statementsGuideCommand.summary}`,
        ],
      },
      {
        title: "Workflows",
        items: [
          "  fide statements write '[{ ... statement inputs ... }]'",
          "  fide statements write --file inputs.json",
          "  fide statements draft --name research-notes --file inputs.json",
          "  fide statements guide --entity NetworkResource",
        ],
      },
      {
        title: "Notes",
        items: [
          "  - `statements write` writes canonical JSONL batches into the local project `.fide` directory.",
          "  - `statements draft` creates or updates a local markdown draft from the same statement batch.",
          "  - `statements guide` shows the statement-shape guidance and allowed entity types agents need while authoring statements.",
          "  - These commands are local-only and do not target hosted workspace state directly.",
        ],
      },
    ],
  });
}
