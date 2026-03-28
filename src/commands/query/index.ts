import { hasFlag, parseArgs } from "../../util/command/args.js";
import { booleanKeysFromCommand, mergeBooleanKeySets, renderCommandHelp } from "../../util/command/command-metadata.js";
import { queryGetCommand, runQueryGet } from "./get.js";
import { queryCommandHelp } from "./help.js";
import { queryListCommand, runQueryList } from "./list.js";
import { runQueryRun, queryRunCommand } from "./run.js";
import { runQuerySave } from "./save.js";
import { querySaveCommand } from "./save.js";

export const QUERY_ROUTER_BOOLEAN_KEYS = mergeBooleanKeySets(
  booleanKeysFromCommand(queryRunCommand),
  booleanKeysFromCommand(queryListCommand),
  booleanKeysFromCommand(queryGetCommand),
  booleanKeysFromCommand(querySaveCommand),
);

function commandHelp(command: string): string {
  switch (command) {
    case "run":
      return renderCommandHelp(queryRunCommand);
    case "list":
      return renderCommandHelp(queryListCommand);
    case "get":
      return renderCommandHelp(queryGetCommand);
    case "save":
      return renderCommandHelp(querySaveCommand);
    default:
      return queryCommandHelp();
  }
}

export async function runQueryCommand(args: string[]): Promise<number> {
  const [command, ...rest] = args;

  if (!command || command === "--help" || command === "-h" || command === "help") {
    console.log(queryCommandHelp());
    return 0;
  }

  const parsed = parseArgs(rest, { booleanKeys: QUERY_ROUTER_BOOLEAN_KEYS });
  if (hasFlag(parsed.flags, "help") || hasFlag(parsed.flags, "-h")) {
    console.log(commandHelp(command));
    return 0;
  }

  if (command === "run") {
    return runQueryRun(rest);
  }
  if (command === "list") {
    return runQueryList(rest);
  }
  if (command === "get") {
    return runQueryGet(rest);
  }
  if (command === "save") {
    return runQuerySave(rest);
  }

  console.error(`Unknown query command: ${command}`);
  console.error(queryCommandHelp());
  return 1;
}
export { queryCommandHelp } from "./help.js";
