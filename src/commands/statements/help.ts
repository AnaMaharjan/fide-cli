import { renderHelp } from "../../util/command/help/index.js";
import { statementsDraftCommand } from "./draft.js";
import { statementsGuideCommand } from "./guide.js";
import { statementsLoadCommand } from "./load.js";
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
          `  load       ${statementsLoadCommand.summary}`,
          `  guide      ${statementsGuideCommand.summary}`,
        ],
      },
      {
        title: "Workflows",
        items: [
          `  fide statements write '{"statements":[{ ... statement inputs ... }]}'`,
          "  fide statements write --file inputs.json",
          "  fide statements draft --name research-notes --file inputs.json",
          "  fide statements load --graph-key primary",
          "  fide statements guide --entity NetworkResource",
        ],
      },
      {
        title: "Notes",
        items: [
          "  - `statements write` writes canonical JSONL batches into the local project `.fide` directory.",
          "  - `statements draft` creates or updates a local markdown draft from the same statement batch.",
          "  - `statements load` loads local canonical statement batches into an initialized graph and skips batches whose ids already exist; use `--replace-batches` to purge statement batches listed in `_meta.json` `sourceDraftRootPendingReplacement` (including multi-batch replaces) and to drop graph batches with no `_meta.json` or `.jsonl` anymore.",
          "  - `statements guide` shows the statement-shape guidance and allowed entity types agents need while authoring statements.",
          "  - These commands are local-only and do not target hosted workspace state directly.",
        ],
      },
    ],
  });
}
