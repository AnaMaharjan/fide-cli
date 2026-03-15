import { renderHelp } from "../../util/help.js";

export function storeCommandHelp(): string {
  return renderHelp({
    sections: [
      {
        title: "Usage",
        items: [
          "  fide store <command> [flags]",
        ],
      },
      {
        title: "Commands",
        items: [
          "  status       Inspect configured stores and build state",
          "  sql          Run SQL against a configured sqlite or postgres statement store",
          "  build        Build a recipe-backed store from configured sources",
        ],
      },
      {
        title: "Workflows",
        items: [
          "  fide store status",
          "  fide store sql --store primary 'select * from statements limit 10'",
          "  fide store build --statements combined",
        ],
      },
      {
        title: "Notes",
        items: [
          "  - Statement stores are configured under `statementStores` in `settings.json`.",
          "  - `fide-jsonl` stores are local statement directories; use `fide graph write` to author into them.",
          "  - Recipe-backed stores are built with `fide store build`.",
          "  - Local .fide authoring lives under `fide graph`.",
        ],
      },
    ],
  });
}
