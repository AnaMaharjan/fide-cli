import { workspaceRolesHelp } from "./help.js";
import { runWorkspaceRolesGrant } from "./grant.js";
import { runWorkspaceRolesRevoke } from "./revoke.js";

export async function runWorkspaceRolesCommand(args: string[]): Promise<number> {
  const [command, ...rest] = args;
  if (!command || command === "--help" || command === "-h" || command === "help") {
    console.log(workspaceRolesHelp());
    return 0;
  }

  if (command === "grant") {
    return runWorkspaceRolesGrant(rest);
  }

  if (command === "revoke") {
    return runWorkspaceRolesRevoke(rest);
  }

  console.error(`Unknown workspace roles command: ${command}`);
  console.error(workspaceRolesHelp());
  return 1;
}
