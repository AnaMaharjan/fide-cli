import { renderHelp } from "../../../util/help.js";

export function graphStatementsHelp(): string {
  return renderHelp({
    sections: [
      {
        title: "Usage",
        items: [
          "  fide graph statements <command> [flags]",
        ],
      },
      {
        title: "Commands",
        items: [
          "  write      Write statement inputs into a local .fide directory",
        ],
      },
      {
        title: "Workflows",
        items: [
          "  fide graph statements write '[{ ... statement inputs ... }]'",
          "  fide graph statements write --file inputs.json",
        ],
      },
    ],
  });
}
