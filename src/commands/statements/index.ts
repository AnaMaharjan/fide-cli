import { statementsHelp } from "./help.js";
import { runStatementsDraft } from "./draft.js";
import { runStatementsGuide } from "./guide.js";
import { runStatementsLoad } from "./load.js";
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

  if (command === "load") {
    return runStatementsLoad(rest);
  }

  if (command === "guide") {
    return runStatementsGuide(rest);
  }

  console.error(`Unknown statements command: ${command}`);
  console.error(statementsHelp());
  return 1;
}
