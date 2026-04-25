import { renderHelp } from "../../util/command/help/index.js";
import { mapsAddCommand } from "./add.js";
import { mapsGetCommand } from "./get.js";
import { mapsListCommand } from "./list.js";
import { mapsRemoveCommand } from "./remove.js";
import { mapsValidateCommand } from "./validate.js";

export function mapsCommandHelp(): string {
  return renderHelp({
    sections: [
      {
        title: "Usage",
        items: ["  fide maps <command> [flags]"],
      },
      {
        title: "Commands",
        items: [
          `  add       ${mapsAddCommand.summary}`,
          `  list      ${mapsListCommand.summary}`,
          `  get       ${mapsGetCommand.summary}`,
          `  validate  ${mapsValidateCommand.summary}`,
          `  remove    ${mapsRemoveCommand.summary}`,
        ],
      },
      {
        title: "Workflows",
        items: [
          "  fide maps add http://localhost:2996/r/fide-map-block-linkedin-profile.json",
          "  fide maps list --kind block",
          "  fide maps get blocks.person.social-profile.linkedin",
          "  fide maps validate",
        ],
      },
      {
        title: "Notes",
        items: [
          "  - `fide maps add` installs shadcn-compatible registry items without shelling out to shadcn.",
          "  - Installed files are restricted to the resolved FIDE_DIR/maps directory.",
          "  - JSON output is the default. Use --pretty or -p for human-readable output.",
        ],
      },
    ],
  });
}
