import { runGraphConnectCommand } from "./connect.js";
import { runGraphGet } from "./get.js";
import { graphCommandHelp } from "./help.js";
import { runGraphList } from "./list.js";
import { runGraphStatus } from "./status.js";

/**
 * Route `fide graph <command>` subcommands.
 */
export async function runGraphCommand(command: string | undefined, args: string[]): Promise<number> {
  if (!command || command === "--help" || command === "-h" || command === "help") {
    console.log(graphCommandHelp());
    return 0;
  }

  if (command === "status") {
    return runGraphStatus(args);
  }

  if (command === "list") {
    return runGraphList(args);
  }

  if (command === "get") {
    return runGraphGet(args);
  }

  if (command === "connect") {
    return runGraphConnectCommand(args);
  }

  console.error(`Unknown graph command: ${command}`);
  console.error(graphCommandHelp());
  return 1;
}
