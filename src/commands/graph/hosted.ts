import { parseArgs, getStringFlag, hasFlag, shouldUseJsonOutput } from "../../util/args.js";
import { renderCommandHelp } from "../../util/command-metadata.js";
import { printJson, readUtf8 } from "../../util/io.js";
import { okResponse } from "../../util/response.js";
import { resolveWorkspaceSelectionOrThrow } from "../../util/workspace-settings.js";
import { requireWorkspaceApiClient } from "../workspace/shared.js";
import { graphGetCommand, graphListCommand, graphSaveCommand } from "./metadata.js";

type HostedGraphRecord = {
  type: "postgres" | "sqlite" | "fide-jsonl";
  schema?: string;
  connection?: string;
  connectionRef?: string;
  gitignore?: boolean;
  recipe?: unknown;
  metadata?: unknown;
};

function readGraphs(settings: Record<string, unknown>): Record<string, HostedGraphRecord> {
  const raw = settings.graphs;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return raw as Record<string, HostedGraphRecord>;
}

async function readGraphInput(args: string[]): Promise<{ flags: Map<string, string | boolean>; graph: HostedGraphRecord }> {
  const { flags, positionals } = parseArgs(args);
  if (hasFlag(flags, "help") || hasFlag(flags, "-h")) {
    console.log(renderCommandHelp(graphSaveCommand));
    return { flags, graph: { type: "postgres", schema: "" } };
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
      graph: JSON.parse(raw) as HostedGraphRecord,
    };
  }

  const type = getStringFlag(flags, "type");
  if (!type || !["postgres", "sqlite", "fide-jsonl"].includes(type)) {
    throw new Error("Missing required flag: --type <postgres|sqlite|fide-jsonl>.");
  }
  const graphType = type as HostedGraphRecord["type"];
  const connection = getStringFlag(flags, "connection");
  const connectionRef = getStringFlag(flags, "connection-ref");
  const recipeFile = getStringFlag(flags, "recipe-file");
  const recipe = recipeFile ? JSON.parse(await readUtf8(recipeFile)) : undefined;

  if (graphType === "postgres") {
    const schema = getStringFlag(flags, "schema");
    if (!schema) throw new Error("Missing required flag: --schema <schema>.");
    if (!connection && !connectionRef) {
      throw new Error("Missing required graph connection. Pass either --connection or --connection-ref.");
    }
    if (connection && connectionRef) {
      throw new Error("Provide exactly one of --connection or --connection-ref.");
    }
    return {
      flags,
      graph: {
        type: graphType,
        schema,
        ...(connection ? { connection } : {}),
        ...(connectionRef ? { connectionRef } : {}),
        ...(recipe ? { recipe } : {}),
      },
    };
  }

  if (!connection) {
    throw new Error("Missing required flag: --connection <value>.");
  }

  return {
    flags,
    graph: {
      type: graphType,
      connection,
      ...(hasFlag(flags, "gitignore") ? { gitignore: true } : {}),
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
  const { auth, client } = await requireWorkspaceApiClient();
  const settings = await client.getWorkspaceSettings(selection.workspaceId);
  const graphs = readGraphs(settings.settings);
  const records = Object.entries(graphs).map(([graphKey, graph]) => ({
    graphKey,
    ...graph,
  }));

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
  const { auth, client } = await requireWorkspaceApiClient();
  const settings = await client.getWorkspaceSettings(selection.workspaceId);
  const graph = readGraphs(settings.settings)[graphKey];
  if (!graph) {
    throw new Error(`Hosted graph not found in workspace settings: ${graphKey}`);
  }

  const payload = okResponse("graph-get.v1", {
    baseUrl: auth.baseUrl,
    source: auth.source,
    workspaceId: selection.workspaceId,
    workspaceSelectionSource: selection.source,
    graph: {
      graphKey,
      ...graph,
    },
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
  const graphKey = getStringFlag(flags, "graph");
  if (!graphKey) throw new Error("Missing required flag: --graph <name>.");

  const selection = await resolveWorkspaceSelectionOrThrow(flags);
  const { auth, client } = await requireWorkspaceApiClient();
  const current = await client.getWorkspaceSettings(selection.workspaceId);
  const settings = current.settings;
  const graphs = readGraphs(settings);
  const nextSettings = {
    ...settings,
    graphs: {
      ...graphs,
      [graphKey]: graph,
    },
  };
  const result = await client.setWorkspaceSettings(selection.workspaceId, nextSettings);

  const payload = okResponse("graph-save-workspace.v1", {
    baseUrl: auth.baseUrl,
    source: auth.source,
    workspaceId: selection.workspaceId,
    workspaceSelectionSource: selection.source,
    graphKey,
    graph,
    settings: result.settings,
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
