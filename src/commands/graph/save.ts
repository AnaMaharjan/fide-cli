import type { FideSettings } from "@chris-test/graph";
import {
  planHostedWorkspaceGraphSync,
  projectLocalGraphToHostedGraph,
  type HostedWorkspaceGraphInput,
  type LocalProjectGraphRecord,
} from "@chris-test/workspace";
import { getStringFlag, hasFlag, parseArgs, shouldUseJsonOutput } from "../../util/command/args.js";
import {
  booleanKeysFromCommand,
  defineCommand,
  mergeBooleanKeySets,
  renderCommandHelp,
} from "../../util/command/command-metadata.js";
import { printJson, readUtf8 } from "../../util/command/io.js";
import { assertGraphKey } from "../../util/ids/selectors.js";
import { formatPretty } from "../../util/command/pretty.js";
import { okResponse } from "../../util/command/response.js";
import { readJsonFile, resolveSettingsPath } from "../../util/project/fide-dir.js";
import { resolveWorkspaceSelectionOrThrow } from "../../util/workspace/workspace-settings.js";
import { requireWorkspaceApiClient, runHostedOperation } from "../workspace/shared.js";

export const graphSaveCommand = defineCommand({
  surface: "graph.save",
  command: "fide graph save",
  outputType: "GraphSaveOutput",
  summary: "Project local graph metadata into a hosted workspace graph",
  usage: [
    "fide graph save --graph <key> --type postgres",
    "fide graph save --graph <key> --type sqlite",
    "fide graph save --graph <key> --stdin",
  ],
  paramOrder: ["graph", "type", "recipe-file", "file", "stdin", "dry-run", "pretty"],
  params: {
    graph: { kind: "string", required: true, description: "Graph key", valueLabel: "<key>" },
    type: { kind: "string", enum: ["postgres", "sqlite", "fide-jsonl"], description: "Hosted graph type" },
    "recipe-file": { kind: "string", description: "JSON file containing graph recipe steps", valueLabel: "<recipe.json>" },
    file: { kind: "string", description: "Read the full hosted graph metadata object from a file", valueLabel: "<graph.json>" },
    stdin: { kind: "boolean", description: "Read the full hosted graph metadata object from stdin" },
    "dry-run": { kind: "boolean", description: "Validate the hosted graph write and show the intended change without saving it" },
    pretty: { kind: "boolean", shorthand: "-p", description: "Human-readable output" },
  },
  examples: [
    "fide graph save --graph primary",
    "fide graph save --graph combined-graph-postgres --type postgres",
  ],
  notes: [
    "If no explicit graph definition is provided, `--graph <key>` first looks for a local project graph with the same key in `.fide/settings.json`.",
    "Hosted graph writes are one-way projections of shared graph fields from the local project into the workspace bound in project `.fide/settings.json`.",
    "Local connection details stay in project `.fide/settings.json` and are not saved to the workspace.",
    "Use `--dry-run` to preview whether the hosted graph metadata would change before writing it.",
    "Pass `--file` or `--stdin` to provide the full hosted graph metadata object instead of individual flags.",
  ],
});

const GRAPH_SAVE_PARSE_KEYS = mergeBooleanKeySets(booleanKeysFromCommand(graphSaveCommand));

export type GraphSaveOutput = {
  ok: true;
  scope: "graph-save-workspace.v1";
  command: "fide graph save";
  next?: Record<string, unknown>;
  [key: string]: unknown;
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

async function readGraphInput(args: string[]): Promise<{ flags: Map<string, string | boolean>; graph: HostedWorkspaceGraphInput }> {
  const { flags, positionals } = parseArgs(args, { booleanKeys: GRAPH_SAVE_PARSE_KEYS });
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
      graphKey,
      workspaceId: selection.workspaceId,
      wouldChange,
      ...preview,
      graph,
    }, {
      command: "fide graph save",
      next: {
        apply: `fide graph save --graph ${graphKey}`,
      },
    });

    if (useJson) {
      printJson(payload);
    } else {
      console.log(formatPretty("graph-save-workspace.v1", payload) ?? JSON.stringify(payload, null, 2));
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
    workspaceId: selection.workspaceId,
    workspaceSelectionSource: selection.source,
    graphKey,
    graph: result,
  }, {
    command: "fide graph save",
    next: {
      get: `fide graph get --graph ${graphKey}`,
      run: `fide query run --graph ${graphKey} 'select * from statements limit 10'`,
    },
  });

  if (useJson) {
    printJson(payload);
  } else {
    console.log(formatPretty("graph-save-workspace.v1", payload) ?? JSON.stringify(payload, null, 2));
  }
  return 0;
}
