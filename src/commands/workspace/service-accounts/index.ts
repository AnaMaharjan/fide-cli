import { workspaceServiceAccountsHelp } from "./help.js";
import { runWorkspaceServiceAccountCreate } from "./create.js";

export async function runWorkspaceServiceAccountsCommand(args: string[]): Promise<number> {
  const [command, ...rest] = args;
  if (!command || command === "--help" || command === "-h" || command === "help") {
    console.log(workspaceServiceAccountsHelp());
    return 0;
  }

  if (command === "create") {
    return runWorkspaceServiceAccountCreate(rest);
  }

  console.error(`Unknown workspace service-accounts command: ${command}`);
  console.error(workspaceServiceAccountsHelp());
  return 1;
}
