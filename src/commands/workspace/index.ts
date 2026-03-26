import { workspaceCommandHelp } from "./help.js";
import { runWorkspaceList } from "./list.js";
import { runWorkspaceGet } from "./get.js";

export async function runWorkspaceCommand(command: string | undefined, args: string[]): Promise<number> {
  if (!command || command === "--help" || command === "-h" || command === "help") {
    console.log(workspaceCommandHelp());
    return 0;
  }

  if (command === "list") {
    return runWorkspaceList(args);
  }

  if (command === "get") {
    return runWorkspaceGet(args);
  }

  console.error(`Unknown workspace command: ${command}`);
  console.error(workspaceCommandHelp());
  return 1;
}
