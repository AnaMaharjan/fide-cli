import { runGraphAdd } from "./add.js";
import { runGraphDraft } from "./draft.js";
import { runGraphDefs } from "./defs.js";
import { graphCommandHelp } from "./help.js";
import { runInitCommand } from "./init.js";
import { runGraphQuery } from "./query.js";
import { runGraphRun } from "./run.js";
import { runGraphStatus } from "./status.js";

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

  if (command === "draft") {
    return runGraphDraft(args);
  }

  if (command === "init") {
    return runInitCommand(args);
  }

  if (command === "query") {
    return runGraphQuery(args);
  }

  if (command === "run") {
    return runGraphRun(args);
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
