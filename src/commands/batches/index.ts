import { batchesHelp } from "./help.js";
import { runBatchesLoad } from "./load.js";
import { runBatchesWrite } from "./write.js";

export async function runBatchesCommand(args: string[]): Promise<number> {
  const [command, ...rest] = args;
  if (!command || command === "--help" || command === "-h" || command === "help") {
    console.log(batchesHelp());
    return 0;
  }

  if (command === "write") {
    return runBatchesWrite(rest);
  }
  if (command === "load") {
    return runBatchesLoad(rest);
  }

  console.error(`Unknown batches command: ${command}`);
  console.error(batchesHelp());
  return 1;
}
