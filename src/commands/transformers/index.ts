import { hasFlag, parseArgs } from "../../util/command/args.js";
import { booleanKeysFromCommand, mergeBooleanKeySets, renderCommandHelp } from "../../util/command/command-metadata.js";
import { transformersAddCommand, runTransformersAdd } from "./add.js";
import { transformersGuideCommand, runTransformersGuide } from "./guide.js";
import { transformersGetCommand, runTransformersGet } from "./get.js";
import { transformersCommandHelp } from "./help.js";
import { transformersListCommand, runTransformersList } from "./list.js";
import { transformersRemoveCommand, runTransformersRemove } from "./remove.js";
import { transformersValidateCommand, runTransformersValidate } from "./validate.js";

export const TRANSFORMERS_ROUTER_BOOLEAN_KEYS = mergeBooleanKeySets(
  booleanKeysFromCommand(transformersAddCommand),
  booleanKeysFromCommand(transformersGuideCommand),
  booleanKeysFromCommand(transformersListCommand),
  booleanKeysFromCommand(transformersGetCommand),
  booleanKeysFromCommand(transformersValidateCommand),
  booleanKeysFromCommand(transformersRemoveCommand),
);

function commandHelp(command: string): string {
  switch (command) {
    case "add":
      return renderCommandHelp(transformersAddCommand);
    case "list":
      return renderCommandHelp(transformersListCommand);
    case "guide":
      return renderCommandHelp(transformersGuideCommand);
    case "get":
      return renderCommandHelp(transformersGetCommand);
    case "validate":
      return renderCommandHelp(transformersValidateCommand);
    case "remove":
      return renderCommandHelp(transformersRemoveCommand);
    default:
      return transformersCommandHelp();
  }
}

export async function runTransformersCommand(args: string[]): Promise<number> {
  const [command, ...rest] = args;

  if (!command || command === "--help" || command === "-h" || command === "help") {
    console.log(transformersCommandHelp());
    return 0;
  }

  const parsed = parseArgs(rest, { booleanKeys: TRANSFORMERS_ROUTER_BOOLEAN_KEYS });
  if (hasFlag(parsed.flags, "help")) {
    console.log(commandHelp(command));
    return 0;
  }

  if (command === "add") return runTransformersAdd(rest);
  if (command === "guide") return runTransformersGuide(rest);
  if (command === "list") return runTransformersList(rest);
  if (command === "get") return runTransformersGet(rest);
  if (command === "validate") return runTransformersValidate(rest);
  if (command === "remove") return runTransformersRemove(rest);

  console.error(`Unknown transformers command: ${command}`);
  console.error(transformersCommandHelp());
  return 1;
}

export { transformersCommandHelp } from "./help.js";
