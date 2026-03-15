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
          "  query    Save a named graph query into app storage",
        ],
      },
      {
        title: "Notes",
        items: [
          "  - App targets are configured under `appTargets` in `settings.json` inside the resolved Fide workspace.",
          "  - App storage is separate from configured backend storage in `storeTargets`.",
          "  - Run `fide app <command> -h` for command-specific help.",
        ],
      },
    ],
  });
}
