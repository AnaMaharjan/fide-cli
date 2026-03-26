import { pluginCommandHelp } from "./help.js";
import { runPluginInstall } from "./install.js";

export async function runPluginCommand(command: string | undefined, args: string[]): Promise<number> {
  if (!command || command === "--help" || command === "-h" || command === "help") {
    console.log(pluginCommandHelp());
    return 0;
  }

  if (command === "install") {
    return runPluginInstall(args);
  }

  console.error(`Unknown plugin command: ${command}`);
  console.error(pluginCommandHelp());
  return 1;
}
