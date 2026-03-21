import { runGraphDraft } from "./draft.js";
import { runGraphBuild } from "./build.js";
import { runGraphDefs } from "./defs.js";
import { graphCommandHelp } from "./help.js";
import { runGraphGet, runGraphList, runGraphSaveCommand } from "./hosted.js";
import { runGraphQueryCommand } from "./query.js";
import { runGraphStatus } from "./status.js";
import { runGraphStatementsCommand } from "./statements/index.js";

/**
 * Route `fide graph <command>` subcommands.
 */
export async function runGraphCommand(command: string | undefined, args: string[]): Promise<number> {
  if (!command || command === "--help" || command === "-h" || command === "help") {
    console.log(graphCommandHelp());
    return 0;
  }

  if (command === "statements") {
    return runGraphStatementsCommand(args);
  }

  if (command === "draft") {
    return runGraphDraft(args);
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

  if (command === "query") {
    return runGraphQueryCommand(args);
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
