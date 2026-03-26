import { parseArgs } from "../../util/command/args.js";
import { booleanKeysFromCommand, defineCommand, mergeBooleanKeySets, renderCommandHelp } from "../../util/command/command-metadata.js";
import { printJson } from "../../util/command/io.js";
import { formatPretty } from "../../util/command/pretty.js";
import {
  assertGraphKey,
  assertLocalQueryCommand,
  readLocalQueries,
  resolveGraphTarget,
  shouldUseJsonOutput,
} from "./shared.js";

export const queryListCommand = defineCommand({
  surface: "query.list",
  command: "fide query list",
  outputType: "QueryListOutput",
  summary: "List local project query summaries",
  usage: ["fide query list", "fide query list --graph <key>"],
  paramOrder: ["graph", "fide-dir", "pretty"],
  params: {
    graph: { kind: "string", description: "Optional graph key filter", valueLabel: "<key>" },
    "fide-dir": { kind: "string", description: "Local .fide directory override", valueLabel: "<path>" },
    pretty: { kind: "boolean", shorthand: "-p", description: "Human-readable output" },
  },
  examples: ["fide query list", "fide query list --graph primary"],
  notes: [
    "Lists query definitions from the current project's `.fide/queries/` directory.",
    "The query list is local-first source of truth and does not read hosted state.",
    "Use `fide query get --graph <key> --name <query-name>` to read the full query text for a selected result.",
  ],
});

const QUERY_LIST_PARSE_KEYS = mergeBooleanKeySets(booleanKeysFromCommand(queryListCommand));

export type QueryListOutput = {
  targetScope: "local";
  root: string;
  queries: Array<{
    graphKey: string;
    name: string;
    description: string | null;
  }>;
};

export async function runQueryList(args: string[]): Promise<number> {
  const { flags } = parseArgs(args, { booleanKeys: QUERY_LIST_PARSE_KEYS });
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
