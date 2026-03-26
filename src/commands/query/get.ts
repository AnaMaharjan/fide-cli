import { parseArgs } from "../../util/command/args.js";
import { booleanKeysFromCommand, defineCommand, mergeBooleanKeySets, renderCommandHelp } from "../../util/command/command-metadata.js";
import { printJson } from "../../util/command/io.js";
import { formatPretty } from "../../util/command/pretty.js";
import { assertLocalQueryCommand, readProjectQueryOrThrow, shouldUseJsonOutput } from "./shared.js";

export const queryGetCommand = defineCommand({
  surface: "query.get",
  command: "fide query get",
  outputType: "QueryGetOutput",
  summary: "Read one local project query",
  usage: ["fide query get --graph <key> --name <query-name>"],
  paramOrder: ["graph", "name", "fide-dir", "pretty"],
  params: {
    graph: { kind: "string", required: true, description: "Graph key", valueLabel: "<key>" },
    name: { kind: "string", required: true, description: "Saved query name", valueLabel: "<query-name>" },
    "fide-dir": { kind: "string", description: "Local .fide directory override", valueLabel: "<path>" },
    pretty: { kind: "boolean", shorthand: "-p", description: "Human-readable output" },
  },
  examples: ["fide query get --graph primary --name recentStatements"],
  notes: [
    "Reads the local project query definition from `.fide/queries/`.",
    "Use `fide query list` first when you need to discover the available graph/name pairs.",
  ],
});

const QUERY_GET_PARSE_KEYS = mergeBooleanKeySets(booleanKeysFromCommand(queryGetCommand));

export type QueryGetOutput = {
  targetScope: "local";
  root: string;
  query: {
    graphKey: string;
    name: string;
    description: string | null;
    sql: string;
  };
};

export async function runQueryGet(args: string[]): Promise<number> {
  const { flags } = parseArgs(args, { booleanKeys: QUERY_GET_PARSE_KEYS });
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
