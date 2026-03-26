import { renderCommandHelp } from "../../util/command/command-metadata.js";
import { printJson } from "../../util/command/io.js";
import { formatPretty } from "../../util/command/pretty.js";
import { queryListCommand } from "./metadata.js";
import {
  assertGraphKey,
  assertLocalQueryCommand,
  parseArgs,
  readLocalQueries,
  resolveGraphTarget,
  shouldUseJsonOutput,
} from "./shared.js";

export async function runQueryList(args: string[]): Promise<number> {
  const { flags } = parseArgs(args);
  const useJson = shouldUseJsonOutput(flags);
  if (flags.has("help") || flags.has("-h")) {
    console.log(renderCommandHelp(queryListCommand));
    return 0;
  }
  assertLocalQueryCommand(flags, "fide query list");

  const graphTarget = resolveGraphTarget(flags);
  if (graphTarget.type !== "local") {
    throw new Error("`fide query list` only supports project `.fide` directories.");
  }

  const graphKeyRaw = flags.get("graph");
  const graphKey = typeof graphKeyRaw === "string" ? assertGraphKey(graphKeyRaw) : null;
  const queries = (await readLocalQueries(graphTarget.root))
    .filter((query) => !graphKey || query.graphKey === graphKey)
    .map(({ graphKey: currentGraphKey, name, description }: { graphKey: string; name: string; description: string | null }) => ({ graphKey: currentGraphKey, name, description }));

  const payload = {
    targetScope: "local",
    root: graphTarget.root,
    queries,
  };
  if (useJson) {
    printJson(payload);
  } else {
    console.log(formatPretty("graph-query-list-local.v1", payload));
  }
  return 0;
}
