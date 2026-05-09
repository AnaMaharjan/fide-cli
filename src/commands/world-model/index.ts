import { runWorldModelConnectCommand } from "./connect.js";
import { worldModelCommandHelp } from "./help.js";

/** Route `fide world-model <command>` subcommands. */
export async function runWorldModelCommand(command: string | undefined, args: string[]): Promise<number> {
  if (!command || command === "--help" || command === "-h" || command === "help") {
    console.log(worldModelCommandHelp());
    return 0;
  }

  if (command === "connect") {
    return runWorldModelConnectCommand(args);
  }

  console.error(`Unknown world-model command: ${command}`);
  console.error(worldModelCommandHelp());
  return 1;
}
