import { statementsHelp } from "./help.js";
import { runStatementsDraft } from "./draft.js";
import { runStatementsWrite } from "./write.js";

export async function runStatementsCommand(args: string[]): Promise<number> {
  const [command, ...rest] = args;
  if (!command || command === "--help" || command === "-h" || command === "help") {
    console.log(statementsHelp());
    return 0;
  }

  if (command === "write") {
    return runStatementsWrite(rest);
  }

  if (command === "draft") {
    return runStatementsDraft(rest);
  }

  console.error(`Unknown statements command: ${command}`);
  console.error(statementsHelp());
  return 1;
}
