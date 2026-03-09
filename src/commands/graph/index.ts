import { runGraphAdd } from "./add.js";
import { graphCommandHelp } from "./help.js";
import { runQueryCommand } from "./query/index.js";
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

  const [subcommand, ...rest] = args;

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
    return runQueryCommand(subcommand, rest);
  }

  if (command === "status") {
    return runGraphStatus();
  }

  console.error(`Unknown graph command: ${command}`);
  console.error(graphCommandHelp());
  return 1;
}
