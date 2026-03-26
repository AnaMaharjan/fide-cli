import type { FideSettings } from "@chris-test/graph";
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
import { readJsonFile, resolveFideContext, resolveSettingsPath } from "../../util/project/fide-dir.js";
import type { LocalProjectGraphRecord } from "@chris-test/workspace";

export const graphGetCommand = defineCommand({
  surface: "graph.get",
  command: "fide graph get",
  outputType: "GraphGetOutput",
  summary: "Inspect one local project graph",
  usage: ["fide graph get --graph <key>"],
  paramOrder: ["graph", "pretty"],
  params: {
    graph: { kind: "string", required: true, description: "Graph key", valueLabel: "<key>" },
    pretty: { kind: "boolean", shorthand: "-p", description: "Human-readable output" },
  },
  examples: ["fide graph get --graph primary"],
  notes: [
    "Reads the graph definition from the current project's `.fide/settings.json`.",
  ],
});

const GRAPH_GET_PARSE_KEYS = mergeBooleanKeySets(booleanKeysFromCommand(graphGetCommand));

export type GraphGetOutput = {
  targetScope: "local";
  root: string;
  graphKey: string;
  graph: Record<string, unknown>;
};

function readGraphs(settings: Record<string, unknown>): Record<string, LocalProjectGraphRecord> {
  const raw = settings.graphs;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return raw as Record<string, LocalProjectGraphRecord>;
}

function readLocalProjectGraph(graphKey: string, root: string = process.cwd()): LocalProjectGraphRecord | null {
  const settingsPath = resolveSettingsPath(root);
  const settings = readJsonFile<FideSettings>(settingsPath);
  return readGraphs((settings ?? {}) as Record<string, unknown>)[graphKey] ?? null;
}

export async function runGraphGet(args: string[]): Promise<number> {
  const { flags } = parseArgs(args, { booleanKeys: GRAPH_GET_PARSE_KEYS });
  const useJson = shouldUseJsonOutput(flags);
  if (hasFlag(flags, "help") || hasFlag(flags, "-h")) {
    console.log(renderCommandHelp(graphGetCommand));
    return 0;
  }

  const graphKeyFlag = getStringFlag(flags, "graph");
  const graphKey = graphKeyFlag ? assertGraphKey(graphKeyFlag) : null;
  if (!graphKey) throw new Error("Missing required flag: --graph <key>.");

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
