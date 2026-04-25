import { hasFlag, parseArgs } from "../../util/command/args.js";
import { booleanKeysFromCommand, mergeBooleanKeySets, renderCommandHelp } from "../../util/command/command-metadata.js";
import { mapsAddCommand, runMapsAdd } from "./add.js";
import { mapsGuideCommand, runMapsGuide } from "./guide.js";
import { mapsGetCommand, runMapsGet } from "./get.js";
import { mapsCommandHelp } from "./help.js";
import { mapsListCommand, runMapsList } from "./list.js";
import { mapsRemoveCommand, runMapsRemove } from "./remove.js";
import { mapsValidateCommand, runMapsValidate } from "./validate.js";

export const MAPS_ROUTER_BOOLEAN_KEYS = mergeBooleanKeySets(
  booleanKeysFromCommand(mapsAddCommand),
  booleanKeysFromCommand(mapsGuideCommand),
  booleanKeysFromCommand(mapsListCommand),
  booleanKeysFromCommand(mapsGetCommand),
  booleanKeysFromCommand(mapsValidateCommand),
  booleanKeysFromCommand(mapsRemoveCommand),
);

function commandHelp(command: string): string {
  switch (command) {
    case "add":
      return renderCommandHelp(mapsAddCommand);
    case "list":
      return renderCommandHelp(mapsListCommand);
    case "guide":
      return renderCommandHelp(mapsGuideCommand);
    case "get":
      return renderCommandHelp(mapsGetCommand);
    case "validate":
      return renderCommandHelp(mapsValidateCommand);
    case "remove":
      return renderCommandHelp(mapsRemoveCommand);
    default:
      return mapsCommandHelp();
  }
}

export async function runMapsCommand(args: string[]): Promise<number> {
  const [command, ...rest] = args;

  if (!command || command === "--help" || command === "-h" || command === "help") {
    console.log(mapsCommandHelp());
    return 0;
  }

  const parsed = parseArgs(rest, { booleanKeys: MAPS_ROUTER_BOOLEAN_KEYS });
  if (hasFlag(parsed.flags, "help")) {
    console.log(commandHelp(command));
    return 0;
  }

  if (command === "add") return runMapsAdd(rest);
  if (command === "guide") return runMapsGuide(rest);
  if (command === "list") return runMapsList(rest);
  if (command === "get") return runMapsGet(rest);
  if (command === "validate") return runMapsValidate(rest);
  if (command === "remove") return runMapsRemove(rest);

  console.error(`Unknown maps command: ${command}`);
  console.error(mapsCommandHelp());
  return 1;
}

export { mapsCommandHelp } from "./help.js";
