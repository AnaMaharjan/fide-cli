import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { inspectGraphStore } from "@chris-test/graph-db";
import { hasFlag, parseArgs, shouldUseJsonOutput } from "../../util/command/args.js";
import {
  booleanKeysFromCommand,
  defineCommand,
  mergeBooleanKeySets,
  renderCommandHelp,
} from "../../util/command/command-metadata.js";
import { printJson } from "../../util/command/io.js";
import { formatPretty } from "../../util/command/pretty.js";
import { assertGraphKey } from "../../util/ids/selectors.js";
import {
  getLocalFideWarnings,
  inspectFideJsonlStore,
  listConfiguredStoreTargetKeys,
  resolveGraphTarget,
  resolveStoreTarget,
} from "@chris-test/graph";
export const graphStatusCommand = defineCommand({
  surface: "graph.status",
  command: "fide graph status",
  outputType: "GraphStatusOutput",
  summary: "Inspect local graph state and configured runtime status",
  usage: [
    "fide graph status",
    "fide graph status --fide-dir <path>",
    "fide graph status --graph <key>",
  ],
  paramOrder: ["fide-dir", "graph"],
  params: {
    "fide-dir": { kind: "string", description: "Optional local .fide directory override", valueLabel: "<path>" },
    graph: { kind: "string", description: "Configured graph key", valueLabel: "<key>" },
  },
  notes: [
    "With no selector, also returns local .fide status.",
    "Use `--graph <key>` to narrow the graph status to one configured graph.",
  ],
});

const GRAPH_STATUS_PARSE_KEYS = mergeBooleanKeySets(booleanKeysFromCommand(graphStatusCommand));

export type GraphStatusOutput = {
  ok: true;
  scope: "graph-status.v1";
  local: Record<string, unknown> | null;
  graphs: unknown[];
};

function nextCommands(key: string | null, recipe: unknown, graphStoreType?: "postgres" | "sqlite" | "fide-jsonl"): Record<string, string> | undefined {
  if (!key) return undefined;
  if (graphStoreType === "fide-jsonl") {
    return {
      writeHelpCommand: "fide statements write -h",
      writeCommand: "fide statements write ...",
    };
  }
  const next: Record<string, string> = {
    queryHelpCommand: "fide query run -h",
    queryCommand: `fide query run --graph ${key} ...`,
  };
  if (Array.isArray(recipe) && recipe.length > 0) {
    next.buildHelpCommand = "fide graph build -h";
    next.buildCommand = `fide graph build --graph ${key}`;
  }
  return next;
}

async function getGraphStatus(target: ReturnType<typeof resolveStoreTarget>) {
  if (target.type === "fide-jsonl") {
    const inspection = await inspectFideJsonlStore(target.dir);
    return {
      ok: true,
      graphStoreType: "fide-jsonl" as const,
      key: target.key,
      configured: true,
      reachable: inspection.reachable,
      dir: target.dir,
      recipe: target.recipe,
      lastRunAt: target.runState?.metadata?.lastRunAt,
      lastRunStatementsAdded: target.runState?.metadata?.lastRunStatementsAdded,
      next: nextCommands(target.key, target.recipe, "fide-jsonl"),
      missing: inspection.missing,
      error: inspection.error,
    };
  }

  const inspection = await inspectGraphStore(target);
  return {
    ...inspection,
    next: nextCommands(target.key, target.recipe, target.type),
  };
}

async function getRuntimeStatusOverview() {
  const configuredKeys = listConfiguredStoreTargetKeys();
  const graphs = await Promise.all(configuredKeys.map(async (key) => {
    const resolved = resolveStoreTarget(new Map<string, string | boolean>([["graph", key]]));
    const detailed = await getGraphStatus(resolved);
    return {
      key,
      graphStoreType: detailed.graphStoreType,
      warnings: "warnings" in detailed ? detailed.warnings : undefined,
      next: {
        statusCommand: `fide graph status --graph ${key}`,
        ...(("graphStoreType" in detailed && detailed.graphStoreType === "fide-jsonl")
          ? {
              writeHelpCommand: "fide statements write -h",
              writeCommand: "fide statements write ...",
            }
          : {
              queryHelpCommand: "fide query run -h",
              queryCommand: `fide query run --graph ${key} ...`,
            }),
        ...(Array.isArray((detailed as { recipe?: unknown }).recipe) && (detailed as { recipe?: unknown[] }).recipe!.length > 0 && detailed.graphStoreType !== "fide-jsonl"
          ? {
              buildHelpCommand: "fide graph build -h",
              buildCommand: `fide graph build --graph ${key}`,
            }
          : {}),
      },
    };
  }));

  return {
    graphs,
  };
}

export async function runGraphStatus(args: string[] = []): Promise<number> {
  const { flags, positionals } = parseArgs(args, { booleanKeys: GRAPH_STATUS_PARSE_KEYS });
  const useJson = shouldUseJsonOutput(flags);
  if (hasFlag(flags, "help") || hasFlag(flags, "-h")) {
    console.log(renderCommandHelp(graphStatusCommand));
    return 0;
  }

  if (positionals.length > 0) {
    throw new Error("`graph status` does not accept positional arguments.");
  }

  const graphKey = typeof flags.get("graph") === "string" ? assertGraphKey(String(flags.get("graph"))) : null;
  const hasFideDir = flags.has("fide-dir");

  if (graphKey && hasFideDir) {
    throw new Error("`--fide-dir` only applies to local status. Omit it when targeting a configured store.");
  }

  if (graphKey) {
    const targetFlags = new Map<string, string | boolean>([["graph", graphKey]]);
    const payload = {
      ok: true,
      scope: "graph-status.v1",
      local: null,
      graphs: [await getGraphStatus(resolveStoreTarget(targetFlags))],
    };
    if (useJson) {
      printJson(payload);
    } else {
      console.log(formatPretty("graph-status.v1", payload) ?? JSON.stringify(payload, null, 2));
    }
    return 0;
  }

  const graphTarget = resolveGraphTarget(flags);
  if (graphTarget.type !== "local") {
    throw new Error("`fide graph status` could not resolve a local .fide directory.");
  }

  const { root, configuredFromSettings } = graphTarget;
  const fideDir = resolve(root, ".fide");
  const statementsDir = resolve(fideDir, "statements");
  const hasFide = existsSync(fideDir);
  const hasStatements = existsSync(statementsDir);

  const missing: string[] = [];
  if (!hasFide) missing.push(".fide");

  const local = {
    configured: true,
    next: {
      writeHelpCommand: "fide statements write -h",
      writeCommand: "fide statements write ...",
    },
    root,
    connection: graphTarget.connection ?? root,
    configuredFromSettings,
    fideDir,
    statementsDir,
    statementsDirPresent: hasStatements,
    missing,
    key: graphTarget.key,
    warnings: getLocalFideWarnings(root, { gitignore: graphTarget.gitignore }),
  };

  const payload = {
    ok: true,
    scope: "graph-status.v1",
    local,
    ...(await getRuntimeStatusOverview()),
  };
  if (useJson) {
    printJson(payload);
  } else {
    console.log(formatPretty("graph-status.v1", payload) ?? JSON.stringify(payload, null, 2));
  }
  return 0;
}
