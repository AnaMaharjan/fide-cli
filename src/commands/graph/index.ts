import { runGraphBuild } from "./build.js";
import { runGraphDefs } from "./defs.js";
import { runGraphGet } from "./get.js";
import { graphCommandHelp } from "./help.js";
import { runGraphList } from "./list.js";
import { runGraphSaveCommand } from "./save.js";
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

  if (command === "save") {
    return runGraphSaveCommand(args);
  }

  if (command === "build") {
    return runGraphBuild(args);
  }

  if (command === "defs") {
    return runGraphDefs(args);
  }

  console.error(`Unknown graph command: ${command}`);
  console.error(graphCommandHelp());
  return 1;
}
