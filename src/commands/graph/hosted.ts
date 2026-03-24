import type { FideSettings } from "@chris-test/graph";
import { isDeepStrictEqual } from "node:util";
import { parseArgs, getStringFlag, hasFlag, shouldUseJsonOutput } from "../../util/args.js";
import { renderCommandHelp } from "../../util/command-metadata.js";
import { readJsonFile, resolveSettingsPath } from "../../util/fide-dir.js";
import { printJson, readUtf8 } from "../../util/io.js";
import { okResponse } from "../../util/response.js";
import { resolveWorkspaceSelectionOrThrow } from "../../util/workspace-settings.js";
import { requireWorkspaceApiClient } from "../workspace/shared.js";
import { graphGetCommand, graphListCommand, graphSaveCommand } from "./metadata.js";

type HostedGraphRecord = {
  type: "postgres" | "sqlite" | "fide-jsonl";
  connection?: string;
  recipe?: unknown;
  metadata?: unknown;
};

type HostedWorkspaceGraphInput = {
  type: "postgres" | "sqlite" | "fide-jsonl";
  recipe?: unknown;
  metadata?: unknown;
};

function readGraphs(settings: Record<string, unknown>): Record<string, HostedGraphRecord> {
  const raw = settings.graphs;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return raw as Record<string, HostedGraphRecord>;
}

function toHostedWorkspaceGraphInput(graph: HostedGraphRecord): HostedWorkspaceGraphInput {
  return {
    type: graph.type,
    ...(graph.recipe !== undefined ? { recipe: graph.recipe } : {}),
    ...(graph.metadata !== undefined ? { metadata: graph.metadata } : {}),
  };
}

function readLocalProjectGraph(graphKey: string, root: string = process.cwd()): HostedGraphRecord | null {
  const settingsPath = resolveSettingsPath(root);
  const settings = readJsonFile<FideSettings>(settingsPath);
  return readGraphs((settings ?? {}) as Record<string, unknown>)[graphKey] ?? null;
}

async function readGraphInput(args: string[]): Promise<{ flags: Map<string, string | boolean>; graph: HostedWorkspaceGraphInput }> {
  const { flags, positionals } = parseArgs(args);
  if (hasFlag(flags, "help") || hasFlag(flags, "-h")) {
    console.log(renderCommandHelp(graphSaveCommand));
    return { flags, graph: { type: "postgres" } };
  }

  if (getStringFlag(flags, "connection") || getStringFlag(flags, "connection-ref")) {
    throw new Error("`fide graph save` no longer accepts connection flags. Save graph metadata to the workspace and keep connection config in local project `.fide/settings.json`.");
  }

  const file = getStringFlag(flags, "file");
  const useStdin = hasFlag(flags, "stdin");
  if (file || useStdin || positionals.length > 0) {
    const raw = file
      ? await readUtf8(file)
      : useStdin
        ? await new Promise<string>((resolve, reject) => {
            let input = "";
            process.stdin.setEncoding("utf8");
            process.stdin.on("data", (chunk) => {
              input += chunk;
            });
            process.stdin.on("end", () => resolve(input));
            process.stdin.on("error", reject);
            process.stdin.resume();
          })
        : positionals.join(" ");
    return {
      flags,
      graph: toHostedWorkspaceGraphInput(JSON.parse(raw) as HostedGraphRecord),
    };
  }

  const graphKey = getStringFlag(flags, "graph");
  if (graphKey) {
    const localGraph = readLocalProjectGraph(graphKey);
    if (localGraph) {
      return {
        flags,
        graph: toHostedWorkspaceGraphInput(localGraph),
      };
    }
  }

  const type = getStringFlag(flags, "type");
  if (!type || !["postgres", "sqlite", "fide-jsonl"].includes(type)) {
    if (graphKey) {
      throw new Error(`No local project graph found for "${graphKey}". Pass --type, --file, or --stdin.`);
    }
    throw new Error("Missing required flag: --type <postgres|sqlite|fide-jsonl>.");
  }
  const graphType = type as HostedWorkspaceGraphInput["type"];
  const recipeFile = getStringFlag(flags, "recipe-file");
  const recipe = recipeFile ? JSON.parse(await readUtf8(recipeFile)) : undefined;

  return {
    flags,
    graph: {
      type: graphType,
      ...(recipe ? { recipe } : {}),
    },
  };
}

export async function runGraphList(args: string[]): Promise<number> {
  const { flags } = parseArgs(args);
  const useJson = shouldUseJsonOutput(flags);
  if (hasFlag(flags, "help") || hasFlag(flags, "-h")) {
    console.log(renderCommandHelp(graphListCommand));
    return 0;
  }

  const selection = await resolveWorkspaceSelectionOrThrow(flags);
  const { auth, client } = await requireWorkspaceApiClient(flags);
  const records = await client.listWorkspaceGraphs(selection.workspaceId);

  const payload = okResponse("graph-list.v1", {
    baseUrl: auth.baseUrl,
    source: auth.source,
    workspaceId: selection.workspaceId,
    workspaceSelectionSource: selection.source,
    graphs: records,
  }, {
    command: "fide graph list",
    next: records[0]
      ? {
          get: `fide graph get --workspace ${selection.workspaceId} --graph ${records[0].graphKey}`,
        }
      : undefined,
  });

  if (useJson) {
    printJson(payload);
  } else {
    for (const graph of records) {
      console.log(`${graph.graphKey} ${graph.type}`);
    }
  }
  return 0;
}

export async function runGraphGet(args: string[]): Promise<number> {
  const { flags } = parseArgs(args);
  const useJson = shouldUseJsonOutput(flags);
  if (hasFlag(flags, "help") || hasFlag(flags, "-h")) {
    console.log(renderCommandHelp(graphGetCommand));
    return 0;
  }

  const graphKey = getStringFlag(flags, "graph");
  if (!graphKey) throw new Error("Missing required flag: --graph <name>.");

  const selection = await resolveWorkspaceSelectionOrThrow(flags);
  const { auth, client } = await requireWorkspaceApiClient(flags);
  const graph = await client.getWorkspaceGraph(selection.workspaceId, graphKey);

  const payload = okResponse("graph-get.v1", {
    baseUrl: auth.baseUrl,
    source: auth.source,
    workspaceId: selection.workspaceId,
    workspaceSelectionSource: selection.source,
    graph,
  }, {
    command: "fide graph get",
  });

  if (useJson) {
    printJson(payload);
  } else {
    console.log(JSON.stringify(payload.graph, null, 2));
  }
  return 0;
}

export async function runGraphSaveCommand(args: string[]): Promise<number> {
  const { flags, graph } = await readGraphInput(args);
  if (hasFlag(flags, "help") || hasFlag(flags, "-h")) {
    return 0;
  }
  const useJson = shouldUseJsonOutput(flags);
  const dryRun = hasFlag(flags, "dry-run");
  const graphKey = getStringFlag(flags, "graph");
  if (!graphKey) throw new Error("Missing required flag: --graph <name>.");

  const selection = await resolveWorkspaceSelectionOrThrow(flags);
  const { auth, client } = await requireWorkspaceApiClient(flags);
  if (dryRun) {
    let wouldChange = true;
    try {
      const existing = await client.getWorkspaceGraph(selection.workspaceId, graphKey);
      const nextGraph = {
        type: graph.type,
        ...(graph.recipe !== undefined ? { recipe: graph.recipe } : {}),
        ...(graph.metadata !== undefined ? { metadata: graph.metadata } : {}),
      };
      const currentGraph = {
        type: existing.type,
        ...(existing.recipe !== undefined ? { recipe: existing.recipe } : {}),
        ...(existing.metadata !== undefined ? { metadata: existing.metadata } : {}),
      };
      wouldChange = !isDeepStrictEqual(currentGraph, nextGraph);
    } catch (error) {
      const status = typeof error === "object" && error && "status" in error ? (error as { status?: unknown }).status : null;
      if (status !== 404) {
        throw error;
      }
    }

    const payload = okResponse("graph-save-workspace.v1", {
      dryRun: true,
      wouldChange,
      baseUrl: auth.baseUrl,
      source: auth.source,
      workspaceId: selection.workspaceId,
      workspaceSelectionSource: selection.source,
      graphKey,
      graph,
    }, {
      command: "fide graph save",
      next: {
        get: `fide graph get --workspace ${selection.workspaceId} --graph ${graphKey}`,
      },
    });

    if (useJson) {
      printJson(payload);
    } else {
      console.log(`Dry run: ${graphKey} ${wouldChange ? "would change" : "unchanged"}`);
    }
    return 0;
  }

  const result = await client.saveWorkspaceGraph({
    workspaceId: selection.workspaceId,
    graphKey,
    graph,
  });

  const payload = okResponse("graph-save-workspace.v1", {
    baseUrl: auth.baseUrl,
    source: auth.source,
    workspaceId: selection.workspaceId,
    workspaceSelectionSource: selection.source,
    graphKey,
    graph: result,
  }, {
    command: "fide graph save",
    next: {
      get: `fide graph get --workspace ${selection.workspaceId} --graph ${graphKey}`,
      list: `fide graph list --workspace ${selection.workspaceId}`,
    },
  });

  if (useJson) {
    printJson(payload);
  } else {
    console.log(`${graphKey} ${graph.type}`);
  }
  return 0;
}
