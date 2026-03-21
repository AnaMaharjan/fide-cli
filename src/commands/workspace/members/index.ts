import { workspaceMembersHelp } from "./help.js";
import { runWorkspaceMembers } from "./list.js";
import { runWorkspaceMembersAdd } from "./add.js";

export async function runWorkspaceMembersCommand(args: string[]): Promise<number> {
  const [command, ...rest] = args;
  if (!command || command === "--help" || command === "-h" || command === "help") {
    console.log(workspaceMembersHelp());
    return 0;
  }

  if (command === "list") {
    return runWorkspaceMembers(rest);
  }

  if (command === "add") {
    return runWorkspaceMembersAdd(rest);
  }

  console.error(`Unknown workspace members command: ${command}`);
  console.error(workspaceMembersHelp());
  return 1;
}
