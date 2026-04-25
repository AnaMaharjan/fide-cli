import { renderHelp } from "../../util/command/help/index.js";
import { batchesLoadCommand } from "./load.js";
import { batchesWriteCommand } from "./write.js";

export function batchesHelp(): string {
  return renderHelp({
    sections: [
      {
        title: "Usage",
        items: [
          "  fide batches <command> [flags]",
        ],
      },
      {
        title: "Commands",
        items: [
          `  write  ${batchesWriteCommand.summary}`,
          `  load   ${batchesLoadCommand.summary}`,
        ],
      },
      {
        title: "Workflows",
        items: [
          "  fide batches write --map .fide/maps/blocks/organization/structure.json --data .fide/data/organization/structure",
          "  fide batches write --map .fide/maps/blocks/person/social-profile/linkedin.json --data .fide/data/linkedin",
          "  fide batches load --graph-key local --batches .fide/batches",
        ],
      },
      {
        title: "Notes",
        items: [
          "  - `batches write` maps prepared source JSON data into `.batch.json` files.",
          "  - By default it mirrors `.fide/data` input paths into `.fide/batches` output paths.",
        ],
      },
    ],
  });
}
