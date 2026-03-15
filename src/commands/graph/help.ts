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
          "  init     Initialize a local .fide workspace",
          "  write    Write statement inputs into a local workspace",
          "  draft    Create a markdown statement draft in a local workspace",
          "  status   Inspect the local workspace target",
          "  defs     Inspect statement and entity definitions",
        ],
      },
      {
        title: "Workflows",
        items: [
          "  fide graph init",
          "  fide graph write '[{ ... statement inputs ... }]'",
          "  fide graph draft --file inputs.json",
          "  fide graph defs",
        ],
      },
      {
        title: "Target Resolution",
        items: [
          "  - `--target <path>` resolves a local .fide workspace path.",
          "  - Without `--target`, graph commands use `FIDE_DIR` when set, otherwise the nearest `.fide` directory, otherwise the current working directory.",
          "  - Backend sqlite/postgres targets live under `fide store`, not `fide graph`.",
        ],
      },
    ],
  });
}
