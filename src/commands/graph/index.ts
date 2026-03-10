import { runGraphAdd } from "./add.js";
import { graphCommandHelp } from "./help.js";
import { runGraphQuery } from "./query.js";
import { runGraphRoot } from "./root.js";
import { runGraphStatus } from "./status.js";
import { runGraphValidate } from "./validate.js";

/**
 * Route `fide graph <command>` subcommands.
 */
export async function runGraphCommand(command: string | undefined, args: string[]): Promise<number> {
  if (!command || command === "--help" || command === "-h" || command === "help") {
    console.log(graphCommandHelp());
    return 0;
  }

  if (command === "add") {
    return runGraphAdd(args);
  }

  if (command === "validate") {
    return runGraphValidate(args);
  }

  if (command === "root") {
    return runGraphRoot(args);
  }

  if (command === "query") {
    return runGraphQuery(args);
  }

  if (command === "status") {
    return runGraphStatus(args);
  }

  console.error(`Unknown graph command: ${command}`);
  console.error(graphCommandHelp());
  return 1;
}
