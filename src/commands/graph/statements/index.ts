import { graphStatementsHelp } from "./help.js";
import { runGraphWrite } from "./write.js";

export async function runGraphStatementsCommand(args: string[]): Promise<number> {
  const [command, ...rest] = args;
  if (!command || command === "--help" || command === "-h" || command === "help") {
    console.log(graphStatementsHelp());
    return 0;
  }

  if (command === "write") {
    return runGraphWrite(rest);
  }

  console.error(`Unknown graph statements command: ${command}`);
  console.error(graphStatementsHelp());
  return 1;
}
