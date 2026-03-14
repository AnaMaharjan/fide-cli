import { appCommandHelp } from "./help.js";
import { runAppInit } from "./init.js";

export async function runAppCommand(command: string | undefined, args: string[]): Promise<number> {
  if (!command || command === "--help" || command === "-h" || command === "help") {
    console.log(appCommandHelp());
    return 0;
  }

  if (command === "init") {
    return runAppInit(args);
  }

  console.error(`Unknown app command: ${command}`);
  console.error(appCommandHelp());
  return 1;
}
