import { workspaceCommandHelp } from "./help.js";
import { runWorkspaceList } from "./list.js";
import { runWorkspaceGet } from "./get.js";
import { runWorkspaceMembers } from "./members.js";
import { runWorkspaceMembersAdd } from "./members-add.js";
import { runWorkspaceRolesCommand } from "./roles/index.js";
import { runWorkspaceServiceAccountsCommand } from "./service-accounts/index.js";
import { runWorkspaceSettingsCommand } from "./settings/index.js";
import { runWorkspaceConnectionsCommand } from "./connections/index.js";
import { runWorkspaceQueriesCommand } from "./queries/index.js";

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

  if (command === "members") {
    const [subcommand, ...rest] = args;
    if (subcommand === "add") {
      return runWorkspaceMembersAdd(rest);
    }
    return runWorkspaceMembers(args);
  }

  if (command === "roles") {
    return runWorkspaceRolesCommand(args);
  }

  if (command === "service-accounts") {
    return runWorkspaceServiceAccountsCommand(args);
  }

  if (command === "settings") {
    return runWorkspaceSettingsCommand(args);
  }

  if (command === "connections") {
    return runWorkspaceConnectionsCommand(args);
  }

  if (command === "queries") {
    return runWorkspaceQueriesCommand(args);
  }

  console.error(`Unknown workspace command: ${command}`);
  console.error(workspaceCommandHelp());
  return 1;
}
