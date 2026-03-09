import { parseArgs, shouldUseJsonOutput } from "../../../util/args.js";
import { printJson } from "../../../util/io.js";
import { COMMAND_SCHEMAS } from "../../../util/schemas.js";
import { runStatementsAdd } from "./add.js";
import { statementsHelp } from "./help.js";
import { runStatementsRoot } from "./root.js";
import { runStatementsValidate } from "./validate.js";

/**
 * Route `fide graph statements <command>` subcommands.
 */
export async function runStatementCommand(command: string | undefined, args: string[]): Promise<number> {
  const { flags } = parseArgs(args);
  const useJsonHelp = shouldUseJsonOutput(flags);

  if (!command || command === "--help" || command === "-h" || command === "help") {
    if (useJsonHelp) {
      const schemas = ["graph.statements.add", "graph.statements.validate", "graph.statements.root"].map((k) => ({
        key: k,
        ...COMMAND_SCHEMAS[k],
      }));
      printJson({ commands: schemas });
    } else {
      console.log(statementsHelp());
    }
    return 0;
  }

  if (command === "add") {
    return runStatementsAdd(flags);
  }

  if (command === "validate") return runStatementsValidate(args);
  if (command === "root") return runStatementsRoot(args);

  console.error(`Unknown statement command: ${command}`);
  console.error(statementsHelp());
  return 1;
}

export { runStatementCommand as runStatementsCommand };
