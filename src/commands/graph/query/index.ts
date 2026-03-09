import { parseArgs, shouldUseJsonOutput } from "../../../util/args.js";
import { printJson } from "../../../util/io.js";
import { COMMAND_SCHEMAS } from "../../../util/schemas.js";

function queryHelp(): string {
  return [
    "Usage:",
    "  fide graph query sql --sql \"<query>\" [--json]",
    "",
    "Notes:",
    "  - direct SQL execution is disabled in this CLI",
    "  - use graph API endpoints once apps/api graph routes are wired",
  ].join("\n");
}

/**
 * Route `fide graph query` command variants.
 */
export async function runQueryCommand(command: string | undefined, args: string[]): Promise<number> {
  const { flags } = parseArgs(args);
  const useJsonHelp = shouldUseJsonOutput(flags);

  if (!command || command === "--help" || command === "-h" || command === "help") {
    if (useJsonHelp) {
      printJson(COMMAND_SCHEMAS["graph.query.sql"]);
    } else {
      console.log(queryHelp());
    }
    return 0;
  }

  if (command !== "sql") {
    console.error(`Unknown graph query command: ${command}`);
    console.error(queryHelp());
    return 1;
  }

  const payload = {
    ok: false,
    command: "graph query sql",
    error: "Direct SQL query is not available in this CLI. Use graph API query endpoints.",
  };

  if (shouldUseJsonOutput(flags)) {
    printJson(payload);
  } else {
    console.error(payload.error);
  }

  return 1;
}
