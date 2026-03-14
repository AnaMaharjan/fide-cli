import { renderHelp } from "../../util/help.js";

export function appCommandHelp(): string {
  return renderHelp({
    sections: [
      {
        title: "Usage",
        items: [
          "  fide app <command> [flags]",
        ],
      },
      {
        title: "Commands",
        items: [
          "  init     Initialize app storage for saved queries and query runs",
        ],
      },
      {
        title: "Notes",
        items: [
          "  - App targets are configured under `appTargets` in `.fide/settings.json`.",
          "  - App storage is separate from canonical graph storage in `graphTargets`.",
          "  - Run `fide app <command> -h` for command-specific help.",
        ],
      },
    ],
  });
}
