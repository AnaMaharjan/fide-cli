import type { FideSettings } from "@chris-test/graph";
import { parseArgs, hasFlag, shouldUseJsonOutput } from "../../util/command/args.js";
import {
  booleanKeysFromCommand,
  defineCommand,
  mergeBooleanKeySets,
  renderCommandHelp,
} from "../../util/command/command-metadata.js";
import { printJson } from "../../util/command/io.js";
import { formatPretty } from "../../util/command/pretty.js";
import { readJsonFile, resolveFideContext, resolveSettingsPath } from "../../util/project/fide-dir.js";
import type { LocalProjectGraphRecord } from "@chris-test/workspace";

export const graphListCommand = defineCommand({
  surface: "graph.list",
  command: "fide graph list",
  outputType: "GraphListOutput",
  summary: "List local project graphs",
  usage: ["fide graph list"],
  paramOrder: ["pretty"],
  params: {
    pretty: { kind: "boolean", shorthand: "-p", description: "Human-readable output" },
  },
  examples: ["fide graph list"],
  notes: [
    "Lists graph definitions from the current project's `.fide/settings.json`.",
  ],
});

const GRAPH_LIST_PARSE_KEYS = mergeBooleanKeySets(booleanKeysFromCommand(graphListCommand));

export type GraphListOutput = {
  targetScope: "local";
  root: string;
  graphs: Array<Record<string, unknown>>;
};

function readGraphs(settings: Record<string, unknown>): Record<string, LocalProjectGraphRecord> {
  const raw = settings.graphs;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return raw as Record<string, LocalProjectGraphRecord>;
}

function listLocalProjectGraphs(root: string = process.cwd()): {
  root: string;
  graphs: Array<{ graphKey: string; graph: LocalProjectGraphRecord }>;
} {
  const settingsPath = resolveSettingsPath(root);
  const settings = readJsonFile<FideSettings>(settingsPath);
  const graphs = readGraphs((settings ?? {}) as Record<string, unknown>);
  const fide = resolveFideContext(root);
  return {
    root: fide.root,
    graphs: Object.entries(graphs).map(([graphKey, graph]) => ({ graphKey, graph })),
  };
}

export async function runGraphList(args: string[]): Promise<number> {
  const { flags } = parseArgs(args, { booleanKeys: GRAPH_LIST_PARSE_KEYS });
  const useJson = shouldUseJsonOutput(flags);
  if (hasFlag(flags, "help") || hasFlag(flags, "-h")) {
    console.log(renderCommandHelp(graphListCommand));
    return 0;
  }

  const local = listLocalProjectGraphs();
  const payload = {
    targetScope: "local" as const,
    root: local.root,
    graphs: local.graphs.map(({ graphKey, graph }) => ({
      graphKey,
      ...graph,
    })),
  };

  if (useJson) {
    printJson(payload);
  } else {
    console.log(formatPretty("graph-list.v1", payload));
  }
  return 0;
}
