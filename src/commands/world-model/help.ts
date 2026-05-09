import { renderHelp } from "../../util/command/help/index.js";
import { worldModelConnectCommand } from "./connect.js";

export function worldModelCommandHelp(): string {
  const commandSummaries = [{ name: "connect", summary: worldModelConnectCommand.summary }];

  return renderHelp({
    sections: [
      {
        title: "Usage",
        items: ["  fide world-model <command> [flags]"],
      },
      {
        title: "Commands",
        items: commandSummaries.map(({ name, summary }) => `  ${name.padEnd(7, " ")} ${summary}`),
      },
      {
        title: "Workflows",
        items: [
          "  fide world-model connect --world-model-key demo --connection '{\"type\":\"sqlite\",\"fide-path\":\"world-models/demo/world-model.sqlite\"}'",
          "  fide world-model connect --world-model-key demo --connection '{\"type\":\"sqlite\",\"fide-path\":\"world-models/demo/world-model.sqlite\"}' --initialize",
        ],
      },
      {
        title: "Notes",
        items: [
          "  - `world-model connect` mirrors `graph connect`: it writes `.fide/world-models/<worldModelKey>/config.json` and optionally initializes an empty sqlite file.",
          "  - Filling the world model from source graphs is a separate concern (future `build` / `load`).",
        ],
      },
    ],
  });
}
