import { parseArgs, shouldUseJsonOutput } from "../../util/args.js";
import { renderHelp } from "../../util/help.js";
import { printJson } from "../../util/io.js";

function queryHelp(): string {
  return renderHelp({
    sections: [
      {
        title: "Usage",
        items: [
          "  fide graph query --sql \"<query>\" [--allow-write]",
        ],
      },
      {
        title: "Flags",
        items: [
          "  --sql \"<query>\"         SQL query",
          "  --allow-write            Allow write queries",
          "  --pretty, -p             Human-readable output",
        ],
      },
      {
        title: "Notes",
        items: [
          "  - Direct SQL execution is currently disabled in this CLI.",
          "  - Use graph API query endpoints once apps/api graph routes are wired.",
        ],
      },
    ],
  });
}

/**
 * Handle `fide graph query`.
 */
export async function runGraphQuery(args: string[]): Promise<number> {
  const { flags } = parseArgs(args);

  if (flags.has("help") || flags.has("-h")) {
    console.log(queryHelp());
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
