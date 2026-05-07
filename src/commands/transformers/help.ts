import { renderHelp } from "../../util/command/help/index.js";
import { transformersAddCommand } from "./add.js";
import { transformersGuideCommand } from "./guide.js";
import { transformersGetCommand } from "./get.js";
import { transformersListCommand } from "./list.js";
import { transformersRemoveCommand } from "./remove.js";
import { transformersValidateCommand } from "./validate.js";

export function transformersCommandHelp(): string {
  return renderHelp({
    sections: [
      {
        title: "Usage",
        items: ["  fide transformers <command> [flags]"],
      },
      {
        title: "Commands",
        items: [
          `  add       ${transformersAddCommand.summary}`,
          `  guide     ${transformersGuideCommand.summary}`,
          `  list      ${transformersListCommand.summary}`,
          `  get       ${transformersGetCommand.summary}`,
          `  validate  ${transformersValidateCommand.summary}`,
          `  remove    ${transformersRemoveCommand.summary}`,
        ],
      },
      {
        title: "Workflows",
        items: [
          "  fide transformers add http://localhost:2996/r/fide-transformer-block-linkedin-profile.json",
          "  fide transformers guide --entity Person",
          "  fide transformers list --kind block",
          "  fide transformers get blocks.person.social-profile.linkedin",
          "  fide transformers validate",
        ],
      },
      {
        title: "Notes",
        items: [
          "  - `fide transformers add` installs shadcn-compatible registry items without shelling out to shadcn.",
          "  - Installed files are restricted to the resolved FIDE_DIR/transformers directory.",
          "  - JSON output is the default. Use --pretty or -p for human-readable output.",
        ],
      },
    ],
  });
}
