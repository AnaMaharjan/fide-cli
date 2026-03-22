import { authKeysHelp } from "./help.js";
import { runAuthKeysList } from "./list.js";
import { runAuthKeysCreate } from "./create.js";
import { runAuthKeysRevoke } from "./revoke.js";

export async function runAuthKeysCommand(args: string[]): Promise<number> {
  const [command, ...rest] = args;
  if (!command || command === "--help" || command === "-h" || command === "help") {
    console.log(authKeysHelp());
    return 0;
  }

  if (command === "list") {
    return runAuthKeysList(rest);
  }

  if (command === "create") {
    return runAuthKeysCreate(rest);
  }

  if (command === "revoke") {
    return runAuthKeysRevoke(rest);
  }

  console.error(`Unknown keys command: ${command}`);
  console.error(authKeysHelp());
  return 1;
}
