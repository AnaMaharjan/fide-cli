import { renderHelp } from "../../util/help.js";

export function graphCommandHelp(): string {
  return renderHelp({
    sections: [
      {
        title: "Usage",
        items: [
          "  fide graph <command> [flags]",
        ],
      },
      {
        title: "Commands",
        items: [
          "  init     Initialize a local, postgres, or sqlite graph target",
          "  run      Execute a configured graph recipe into a target graph",
          "  add      Write canonical statements",
          "  draft    Write a markdown statement draft",
          "  status   Show target status",
          "  query    Query graph data",
          "  defs     Show graph statement/entity definitions",
        ],
      },
      {
        title: "Notes",
        items: [
          "  - `--target <name>` resolves a configured graph target from `.fide/settings.json`.",
          "  - `--target <path>` resolves a local .fide workspace path.",
          "  - Without `--target`, graph commands default to the configured local target or the current working directory.",
          "  - Supported configured graph target types: local, postgres, sqlite.",
          "  - Run `fide graph <command> -h` for command-specific help.",
        ],
      },
    ],
  });
}
