import { workspaceConnectionsHelp } from "./help.js";
import { runWorkspaceConnectionsList } from "./list.js";
import { runWorkspaceConnectionsCreate } from "./create.js";

export async function runWorkspaceConnectionsCommand(args: string[]): Promise<number> {
  const [command, ...rest] = args;
  if (!command || command === "--help" || command === "-h" || command === "help") {
    console.log(workspaceConnectionsHelp());
    return 0;
  }

  if (command === "list") {
    return runWorkspaceConnectionsList(rest);
  }

  if (command === "create") {
    return runWorkspaceConnectionsCreate(rest);
  }

  console.error(`Unknown workspace connections command: ${command}`);
  console.error(workspaceConnectionsHelp());
  return 1;
}
