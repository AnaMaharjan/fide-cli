import { runGraphDraft } from "./draft.js";
import { runGraphDefs } from "./defs.js";
import { graphCommandHelp } from "./help.js";
import { runInitCommand } from "./init.js";
import { runGraphStatus } from "./status.js";
import { runGraphWrite } from "./write.js";

/**
 * Route `fide graph <command>` subcommands.
 */
export async function runGraphCommand(command: string | undefined, args: string[]): Promise<number> {
  if (!command || command === "--help" || command === "-h" || command === "help") {
    console.log(graphCommandHelp());
    return 0;
  }

  if (command === "write") {
    return runGraphWrite(args);
  }

  if (command === "draft") {
    return runGraphDraft(args);
  }

  if (command === "init") {
    return runInitCommand(args);
  }

  if (command === "status") {
    return runGraphStatus(args);
  }

  if (command === "defs") {
    return runGraphDefs(args);
  }

  console.error(`Unknown graph command: ${command}`);
  console.error(graphCommandHelp());
  return 1;
}
