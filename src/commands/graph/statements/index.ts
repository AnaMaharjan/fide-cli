import { graphStatementsHelp } from "./help.js";
import { runGraphDraft } from "../draft.js";
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

  if (command === "draft") {
    return runGraphDraft(rest);
  }

  console.error(`Unknown graph statements command: ${command}`);
  console.error(graphStatementsHelp());
  return 1;
}
