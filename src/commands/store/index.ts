import { runStoreInit } from "./init.js";
import { runStoreMaterialize } from "./materialize.js";
import { runStoreSql } from "./sql.js";
import { runStoreStatus } from "./status.js";
import { storeCommandHelp } from "./help.js";

export async function runStoreCommand(command: string | undefined, args: string[]): Promise<number> {
  if (!command || command === "--help" || command === "-h" || command === "help") {
    console.log(storeCommandHelp());
    return 0;
  }

  if (command === "init") {
    return runStoreInit(args);
  }

  if (command === "status") {
    return runStoreStatus(args);
  }

  if (command === "sql") {
    return runStoreSql(args);
  }

  if (command === "materialize") {
    return runStoreMaterialize(args);
  }

  console.error(`Unknown store command: ${command}`);
  console.error(storeCommandHelp());
  return 1;
}
