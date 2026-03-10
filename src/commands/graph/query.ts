import { parseArgs, shouldUseJsonOutput } from "../../util/args.js";
import { printJson } from "../../util/io.js";
import { COMMAND_SCHEMAS } from "../../util/schemas.js";

function queryHelp(): string {
  return [
    "Usage:",
    "  fide graph query --sql \"<query>\" [--json]",
    "",
    "Notes:",
    "  - direct SQL execution is disabled in this CLI",
    "  - use graph API query endpoints once apps/api graph routes are wired",
  ].join("\n");
}

/**
 * Handle `fide graph query`.
 */
export async function runGraphQuery(args: string[]): Promise<number> {
  const { flags } = parseArgs(args);
  const useJsonHelp = shouldUseJsonOutput(flags);

  if (flags.has("help") || flags.has("-h")) {
    if (useJsonHelp) {
      printJson(COMMAND_SCHEMAS["graph.query"]);
    } else {
      console.log(queryHelp());
    }
    return 0;
  }

  const payload = {
    ok: false,
    command: "graph query",
    error: "Direct SQL query is not available in this CLI. Use graph API query endpoints.",
  };

  if (shouldUseJsonOutput(flags)) {
    printJson(payload);
  } else {
    console.error(payload.error);
  }

  return 1;
}
