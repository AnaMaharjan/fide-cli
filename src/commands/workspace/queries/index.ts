import { workspaceQueriesHelp } from "./help.js";
import { runWorkspaceQueriesList } from "./list.js";
import { runWorkspaceQueriesGet } from "./get.js";
import { runWorkspaceQueriesRun } from "./run.js";

export async function runWorkspaceQueriesCommand(args: string[]): Promise<number> {
  const [command, ...rest] = args;

  if (!command || command === "--help" || command === "-h" || command === "help") {
    console.log(workspaceQueriesHelp());
    return 0;
  }

  if (command === "list") {
    return runWorkspaceQueriesList(rest);
  }

  if (command === "get") {
    return runWorkspaceQueriesGet(rest);
  }

  if (command === "run") {
    return runWorkspaceQueriesRun(rest);
  }

  console.error(`Unknown workspace queries command: ${command}`);
  console.error(workspaceQueriesHelp());
  return 1;
}
