import { getStringFlag, hasFlag, parseArgs, shouldUseJsonOutput } from "../../util/command/args.js";
import {
  booleanKeysFromCommand,
  defineCommand,
  mergeBooleanKeySets,
  renderCommandHelp,
} from "../../util/command/command-metadata.js";
import { printJson } from "../../util/command/io.js";
import { assertGraphKey } from "../../util/ids/selectors.js";
import { formatPretty } from "../../util/command/pretty.js";
import { readLocalProjectGraph } from "../../util/project/graph-config.js";
import { resolveFideContext } from "../../util/project/fide-dir.js";

export const graphGetCommand = defineCommand({
  surface: "graph.get",
  command: "fide graph get",
  outputType: "GraphGetOutput",
  summary: "Inspect one local project graph",
  usage: ["fide graph get --graph-key <key>"],
  paramOrder: ["graph-key", "pretty"],
  params: {
    "graph-key": { kind: "string", required: true, description: "Graph key", valueLabel: "<key>" },
    pretty: { kind: "boolean", shorthand: "-p", description: "Human-readable output" },
  },
  examples: ["fide graph get --graph-key primary"],
  notes: [
    "Reads the graph definition from `.fide/graphs/<graphKey>/config.json` in the current project.",
  ],
});

const GRAPH_GET_PARSE_KEYS = mergeBooleanKeySets(booleanKeysFromCommand(graphGetCommand));

export type GraphGetOutput = {
  targetScope: "local";
  root: string;
  graphKey: string;
  graph: Record<string, unknown>;
};

export async function runGraphGet(args: string[]): Promise<number> {
  const { flags } = parseArgs(args, { booleanKeys: GRAPH_GET_PARSE_KEYS });
  const useJson = shouldUseJsonOutput(flags);
  if (hasFlag(flags, "help") || hasFlag(flags, "-h")) {
    console.log(renderCommandHelp(graphGetCommand));
    return 0;
  }

  const graphKeyFlag = getStringFlag(flags, "graph-key");
  const graphKey = graphKeyFlag ? assertGraphKey(graphKeyFlag) : null;
  if (!graphKey) throw new Error("Missing required flag: --graph-key <key>.");

  const fide = resolveFideContext(process.cwd());
  const graph = readLocalProjectGraph(graphKey);
  if (!graph) {
    throw new Error(`Local project graph not found: ${graphKey}. Use \`fide graph list\` to inspect local graphs.`);
  }
  const payload = {
    targetScope: "local" as const,
    root: fide.root,
    graphKey,
    graph,
  };

  if (useJson) {
    printJson(payload);
  } else {
    console.log(formatPretty("graph-get.v1", payload));
  }
  return 0;
}
