import { renderCommandHelp } from "../../util/command/command-metadata.js";
import { printJson } from "../../util/command/io.js";
import { formatPretty } from "../../util/command/pretty.js";
import { queryGetCommand } from "./metadata.js";
import { assertLocalQueryCommand, parseArgs, readProjectQueryOrThrow, shouldUseJsonOutput } from "./shared.js";

export async function runQueryGet(args: string[]): Promise<number> {
  const { flags } = parseArgs(args);
  const useJson = shouldUseJsonOutput(flags);
  if (flags.has("help") || flags.has("-h")) {
    console.log(renderCommandHelp(queryGetCommand));
    return 0;
  }
  assertLocalQueryCommand(flags, "fide query get");

  const { root, query } = await readProjectQueryOrThrow(flags);
  const payload = {
    targetScope: "local",
    root,
    query: {
      graphKey: query.graphKey,
      name: query.name,
      description: query.description,
      sql: query.sql,
    },
  };
  if (useJson) {
    printJson(payload);
  } else {
    console.log(formatPretty("graph-query-get-local.v1", payload));
  }
  return 0;
}
