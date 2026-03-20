import { workspaceSettingsHelp } from "./help.js";
import { runWorkspaceSettingsGet } from "./get.js";
import { runWorkspaceSettingsSet } from "./set.js";

export async function runWorkspaceSettingsCommand(args: string[]): Promise<number> {
  const [command, ...rest] = args;
  if (!command || command === "--help" || command === "-h" || command === "help") {
    console.log(workspaceSettingsHelp());
    return 0;
  }

  if (command === "get") {
    return runWorkspaceSettingsGet(rest);
  }

  if (command === "set") {
    return runWorkspaceSettingsSet(rest);
  }

  console.error(`Unknown workspace settings command: ${command}`);
  console.error(workspaceSettingsHelp());
  return 1;
}
