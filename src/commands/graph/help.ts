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
          "  init     Initialize a jsonl, postgres, or sqlite graph target",
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
          "  - `--target <path>` resolves a jsonl .fide directory path.",
          "  - Without `--target`, graph commands default to the current working directory as a jsonl target.",
          "  - Supported configured graph target types: jsonl, postgres, sqlite.",
          "  - Run `fide graph <command> -h` for command-specific help.",
        ],
      },
    ],
  });
}
