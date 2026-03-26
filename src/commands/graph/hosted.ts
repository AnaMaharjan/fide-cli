import type { FideSettings } from "@chris-test/graph";
import {
  planHostedWorkspaceGraphSync,
  projectLocalGraphToHostedGraph,
  type HostedWorkspaceGraphInput,
  type LocalProjectGraphRecord,
} from "@chris-test/workspace";
import { parseArgs, getStringFlag, hasFlag, shouldUseJsonOutput } from "../../util/command/args.js";
import { renderCommandHelp } from "../../util/command/command-metadata.js";
import { formatPretty } from "../../util/command/pretty.js";
import { readJsonFile, resolveFideContext, resolveSettingsPath } from "../../util/project/fide-dir.js";
import { printJson, readUtf8 } from "../../util/command/io.js";
import { okResponse } from "../../util/command/response.js";
import { assertGraphKey } from "../../util/ids/selectors.js";
import { resolveWorkspaceSelectionOrThrow } from "../../util/workspace/workspace-settings.js";
import { requireWorkspaceApiClient, runHostedOperation } from "../workspace/shared.js";
import { graphGetCommand, graphListCommand, graphSaveCommand } from "./metadata.js";

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

function readLocalProjectGraph(graphKey: string, root: string = process.cwd()): LocalProjectGraphRecord | null {
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
      graph: (() => {
        const projected = projectLocalGraphToHostedGraph("__input__", JSON.parse(raw) as LocalProjectGraphRecord);
        if (!projected) {
          throw new Error("Invalid hosted graph input. Expected a graph object with type `postgres`, `sqlite`, or `fide-jsonl`.");
        }
        return {
          type: projected.type,
          ...(projected.recipe !== undefined ? { recipe: projected.recipe } : {}),
          ...(projected.metadata !== undefined ? { metadata: projected.metadata } : {}),
        };
      })(),
    };
  }

  const graphKeyRaw = getStringFlag(flags, "graph");
  const graphKey = graphKeyRaw ? assertGraphKey(graphKeyRaw) : null;
  if (graphKey) {
    const localGraph = readLocalProjectGraph(graphKey);
    if (localGraph) {
      const projected = projectLocalGraphToHostedGraph(graphKey, localGraph);
      if (!projected) {
        throw new Error(`Local project graph "${graphKey}" is not a valid hosted graph candidate.`);
      }
      return {
        flags,
        graph: {
          type: projected.type,
          ...(projected.recipe !== undefined ? { recipe: projected.recipe } : {}),
          ...(projected.metadata !== undefined ? { metadata: projected.metadata } : {}),
        },
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

export async function runGraphGet(args: string[]): Promise<number> {
  const { flags } = parseArgs(args);
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

export async function runGraphSaveCommand(args: string[]): Promise<number> {
  const { flags, graph } = await readGraphInput(args);
  if (hasFlag(flags, "help") || hasFlag(flags, "-h")) {
    return 0;
  }
  const useJson = shouldUseJsonOutput(flags);
  const dryRun = hasFlag(flags, "dry-run");
  const graphKeyFlag = getStringFlag(flags, "graph");
  const graphKey = graphKeyFlag ? assertGraphKey(graphKeyFlag) : null;
  if (!graphKey) throw new Error("Missing required flag: --graph <key>.");

  const selection = await resolveWorkspaceSelectionOrThrow();
  const { auth, client } = await requireWorkspaceApiClient(flags);
  if (dryRun) {
    let wouldChange = true;
    let preview: {
      targetState: "new-graph" | "existing-graph";
      changeState: "would_change" | "unchanged";
      reason: "graph_missing" | "graph_would_update" | "graph_unchanged";
    } = {
      targetState: "new-graph",
      changeState: "would_change",
      reason: "graph_missing",
    };
    try {
      const existing = await client.getWorkspaceGraph(selection.workspaceId, graphKey);
      const [operation] = planHostedWorkspaceGraphSync({
        localGraphs: new Map([[graphKey, graph]]),
        remoteGraphs: [existing],
      });
      wouldChange = operation?.status === "create" || operation?.status === "update";
      preview = wouldChange
        ? {
          targetState: "existing-graph",
          changeState: "would_change",
          reason: "graph_would_update",
        }
        : {
          targetState: "existing-graph",
          changeState: "unchanged",
          reason: "graph_unchanged",
      };
    } catch (error) {
      const status = typeof error === "object" && error && "status" in error ? (error as { status?: unknown }).status : null;
      if (status !== 404) {
        throw await runHostedOperation(async () => {
          throw error;
        }, {
          auth,
          client,
          targetScope: "workspace",
          workspaceId: selection.workspaceId,
          workspaceSelectionSource: selection.source,
          graphKey,
        });
      }
    }

    const payload = okResponse("graph-save-workspace.v1", {
      dryRun: true,
      wouldChange,
      preview,
      baseUrl: auth.baseUrl,
      source: auth.source,
      workspaceId: selection.workspaceId,
      workspaceSelectionSource: selection.source,
      graphKey,
      graph,
    }, {
      command: "fide graph save",
      next: {
        get: `fide graph get --graph ${graphKey}`,
      },
    });

    if (useJson) {
      printJson(payload);
    } else {
      console.log(formatPretty("graph-save-workspace.v1", payload));
    }
    return 0;
  }

  const result = await runHostedOperation(
    () => client.saveWorkspaceGraph({
      workspaceId: selection.workspaceId,
      graphKey,
      graph,
    }),
    {
      auth,
      client,
      targetScope: "workspace",
      workspaceId: selection.workspaceId,
      workspaceSelectionSource: selection.source,
      graphKey,
    },
  );

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
      get: `fide graph get --graph ${graphKey}`,
      list: "fide graph list",
    },
  });

  if (useJson) {
    printJson(payload);
  } else {
    console.log(formatPretty("graph-save-workspace.v1", payload));
  }
  return 0;
}
