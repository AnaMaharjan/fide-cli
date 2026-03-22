import { authCommandHelp } from "./help.js";
import { runAuthLogin } from "./login.js";
import { runAuthLogout } from "./logout.js";
import { runAuthWhoami } from "./whoami.js";

export async function runAuthCommand(command: string | undefined, args: string[]): Promise<number> {
  if (!command || command === "--help" || command === "-h" || command === "help") {
    console.log(authCommandHelp());
    return 0;
  }

  if (command === "login") {
    return runAuthLogin(args);
  }

  if (command === "logout") {
    return runAuthLogout(args);
  }

  if (command === "whoami") {
    return runAuthWhoami(args);
  }

  console.error(`Unknown auth command: ${command}`);
  console.error(authCommandHelp());
  return 1;
}
