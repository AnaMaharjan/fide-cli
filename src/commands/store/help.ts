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
          "  init         Initialize a configured sqlite or postgres target",
          "  status       Inspect configured backend targets and materialization state",
          "  sql          Run SQL against a configured sqlite or postgres target",
          "  materialize  Materialize a recipe-backed target from configured sources",
        ],
      },
      {
        title: "Workflows",
        items: [
          "  fide store init --type sqlite --connection .tmp/fide-graph.sqlite --store sqlite",
          "  fide store status",
          "  fide store sql --store primary 'select * from statements limit 10'",
          "  fide store materialize --store combined",
        ],
      },
      {
        title: "Notes",
        items: [
          "  - Store commands operate on configured store targets from `settings.json` inside the resolved Fide workspace.",
          "  - Recipe-backed targets are materialized with `fide store materialize`.",
          "  - Local workspace authoring lives under `fide graph`.",
        ],
      },
    ],
  });
}
