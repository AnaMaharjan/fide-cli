// fide graph connect --graph-key sqlite-test --connection '{"type":"sqlite","fide-path":"graphs/sqlite-test/graph.sqlite"}' --initialize '{"dangerously_overwrite":true}'

import { resolve } from "node:path";
import { rm } from "node:fs/promises";
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
import { okResponse } from "../../util/command/response.js";
import {
  initializeSqliteGraphStorage,
} from "@chris-test/graph";
import {
  readLocalProjectGraph,
  writeLocalProjectGraph,
  type LocalProjectGraphRecord,
} from "../../lib/project/config/graph-config.js";
import { resolveFideContext, resolveGraphConfigPath } from "../../lib/project/config/fide-dir.js";
import { validateGraphStoreConfig } from "../../lib/project/config/project-settings.js";

export const graphConnectCommand = defineCommand({
  surface: "graph.connect",
  command: "fide graph connect",
  outputType: "GraphConnectOutput",
  summary: "Create or update a graph connection in this project",
  usage: [
    "fide graph connect --graph-key <graph-key> --connection <connection-json>",
  ],
  paramOrder: [
    "graph-key",
    "connection",
    "initialize",
    "initialize-options",
    "dry-run",
    "pretty",
  ],
  params: {
    "graph-key": {
      kind: "string",
      required: true,
      valueLabel: "<graph-key>",
      description: "Graph key for this connection definition",
    },
    connection: {
      kind: "string",
      valueLabel: "<connection-json>",
      description: "Connection JSON for this graph",
    },
    initialize: { kind: "boolean", description: "Initialize connected graph storage after writing config" },
    "initialize-options": {
      kind: "string",
      valueLabel: "<initialize-options>",
      description: "Initialization options JSON",
    },
    "dry-run": { kind: "boolean", description: "Show the local create or update without writing config.json" },
    pretty: { kind: "boolean", shorthand: "-p", description: "Human-readable output" },
  },
  examples: [
    "fide graph connect --graph-key local --connection '{\"type\":\"sqlite\",\"fide-path\":\"graphs/local/graph.sqlite\"}'",
    "fide graph connect --graph-key local --connection '{\"type\":\"sqlite\",\"project-path\":\"tmp/local-graph.sqlite\"}'",
    "fide graph connect --graph-key local --connection '{\"type\":\"sqlite\",\"fide-path\":\"graphs/local/graph.sqlite\"}' --initialize",
    "fide graph connect --graph-key local --connection '{\"type\":\"sqlite\",\"fide-path\":\"graphs/local/graph.sqlite\"}' --initialize --initialize-options '{\"dangerously_overwrite\":true}'",
  ],
  values: [
    {
      label: "<connection-json>",
      value: '{"type":<connection-json-type>, <connection-json-value>}',
    },
    {
      label: "<initialize-options>",
      value: '{"dangerously_overwrite"?: boolean}',
    },
    {
      label: '<connection-json-type> = "sqlite"',
      children: [
        {
          label: "<connection-json-value>",
          requires: "one of: `fide-path` or `project-path`, ending in `.sqlite`",
          children: [
            {
              label: "fide-path",
              value: "string",
              suggested: '"/graphs/<graph-key>/graph.sqlite"',
            },
            {
              label: "project-path",
              value: "string",
              suggested: '"fide-graphs/<graph-key>/graph.sqlite"',
            },
          ],
        },
      ],
    },
  ],

  notes: [
    "Writes a graph definition into `.fide/graphs/<graphKey>/config.json` in this project.",
    "`fide-path` resolves relative to the active `.fide` directory.",
    "`project-path` resolves relative to the project root and is stable regardless of where the command is launched.",
    "`--initialize-options` is only used when `--initialize` is present.",
    "If the graph key already exists, this command updates it in place.",
    "Use `fide start` to sync local graph metadata from this project into the bound workspace.",
  ],
});

const GRAPH_CONNECT_PARSE_KEYS = mergeBooleanKeySets(booleanKeysFromCommand(graphConnectCommand));
const GRAPH_CONNECT_SCOPE = "graph-connect-local.v1";

export type GraphConnectOutput = {
  ok: true;
  scope: typeof GRAPH_CONNECT_SCOPE;
  command: "fide graph connect";
  next?: Record<string, unknown>;
  [key: string]: unknown;
};

type GraphConnectResultState = "created" | "updated" | "unchanged";
type GraphInitializeOptions = {
  dangerously_overwrite?: boolean;
};

function canonicalizeValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => canonicalizeValue(entry));
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, canonicalizeValue(entry)] as const);
    return Object.fromEntries(entries);
  }
  return value;
}

function localGraphsEqual(left: LocalProjectGraphRecord | null, right: LocalProjectGraphRecord): boolean {
  return JSON.stringify(canonicalizeValue(left)) === JSON.stringify(canonicalizeValue(right));
}

function assertGraphConnectType(value: string | null | undefined): "sqlite" | null {
  if (value === "sqlite") {
    return value;
  }
  return null;
}

function readExistingGraphType(existing: LocalProjectGraphRecord | null): "sqlite" | null {
  if (!existing || !existing.connection || typeof existing.connection !== "object" || Array.isArray(existing.connection)) {
    return null;
  }
  const connectionType = (existing.connection as { type?: unknown }).type;
  return assertGraphConnectType(typeof connectionType === "string" ? connectionType : null);
}

function parseJsonFlag(raw: string | null, flagName: string): unknown {
  if (raw === null) return null;
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`Invalid --${flagName} value. Expected valid JSON.`);
  }
}

function resolveInitializeOptions(raw: string | null): GraphInitializeOptions {
  if (raw === null) return {};
  const parsed = parseJsonFlag(raw, "initialize-options");
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Invalid --initialize-options value. Expected a JSON object.");
  }
  const options = parsed as Record<string, unknown>;
  if (
    options.dangerously_overwrite !== undefined
    && typeof options.dangerously_overwrite !== "boolean"
  ) {
    throw new Error("`dangerously_overwrite` in --initialize-options must be a boolean when provided.");
  }
  return {
    ...(typeof options.dangerously_overwrite === "boolean" ? { dangerously_overwrite: options.dangerously_overwrite } : {}),
  };
}


function resolveSqliteConnection(
  connectionInput: unknown,
  existingConnection: unknown,
): { type: "sqlite"; "fide-path"?: string; "project-path"?: string } {
  const nextConnection = connectionInput ?? existingConnection ?? null;
  if (!nextConnection || typeof nextConnection !== "object" || Array.isArray(nextConnection)) {
    throw new Error(
      "Sqlite graphs require --connection '{\"fide-path\":\"...\"}' or '{\"project-path\":\"...\"}' when creating or updating without an existing connection object.",
    );
  }
  const connection = nextConnection as Record<string, unknown>;
  if (connection.type !== undefined && connection.type !== "sqlite") {
    throw new Error("Sqlite graph connection JSON must include `type: \"sqlite\"` when `type` is provided.");
  }
  const fidePath = typeof connection["fide-path"] === "string" ? connection["fide-path"] : null;
  const projectPath = typeof connection["project-path"] === "string" ? connection["project-path"] : null;
  if ((!fidePath || fidePath.trim().length === 0) && (!projectPath || projectPath.trim().length === 0)) {
    throw new Error("Sqlite graph connection JSON must include a non-empty `fide-path` or `project-path` string.");
  }
  return {
    type: "sqlite",
    ...(fidePath && fidePath.trim().length > 0 ? { "fide-path": fidePath } : {}),
    ...(projectPath && projectPath.trim().length > 0 ? { "project-path": projectPath } : {}),
  };
}

async function readGraphInput(args: string[]): Promise<{
  flags: Map<string, string | boolean>;
  graphKey: string;
  graph: LocalProjectGraphRecord;
}> {
  const { flags } = parseArgs(args, { booleanKeys: GRAPH_CONNECT_PARSE_KEYS });
  if (hasFlag(flags, "help") || hasFlag(flags, "-h")) {
    console.log(renderCommandHelp(graphConnectCommand));
    return {
      flags,
      graphKey: "__help__",
      graph: { connection: { type: "sqlite", "fide-path": "graphs/local/graph.sqlite" } },
    };
  }

  const graphKeyRaw = getStringFlag(flags, "graph-key");
  const graphKey = graphKeyRaw ? assertGraphKey(graphKeyRaw) : null;
  if (!graphKey) throw new Error("Missing required flag: --graph-key <key>.");

  const existing = readLocalProjectGraph(graphKey);
  const connectionInput = parseJsonFlag(getStringFlag(flags, "connection"), "connection");
  const requestedType = connectionInput && typeof connectionInput === "object" && !Array.isArray(connectionInput)
    ? assertGraphConnectType(typeof (connectionInput as { type?: unknown }).type === "string"
      ? (connectionInput as { type: string }).type
      : null)
    : null;
  const type = requestedType ?? readExistingGraphType(existing);
  if (!type) {
    throw new Error(
      existing
        ? `Graph "${graphKey}" is missing a valid connection.type in config.json.`
        : "Missing required connection type. Include `type` in --connection JSON.",
    );
  }

  if (type !== "sqlite") {
    throw new Error("Only sqlite graphs are supported.");
  }

  const connection = resolveSqliteConnection(connectionInput, existing?.connection);

  return {
    flags,
    graphKey,
    graph: {
      ...Object.fromEntries(Object.entries(existing ?? {}).filter(([key]) => key !== "type")),
      connection,
    },
  };
}

function getResultState(previous: LocalProjectGraphRecord | null, next: LocalProjectGraphRecord): GraphConnectResultState {
  if (!previous) return "created";
  return localGraphsEqual(previous, next) ? "unchanged" : "updated";
}

export async function runGraphConnectCommand(args: string[]): Promise<number> {
  const { flags, graphKey, graph } = await readGraphInput(args);
  if (hasFlag(flags, "help") || hasFlag(flags, "-h")) {
    return 0;
  }

  const useJson = shouldUseJsonOutput(flags);
  const dryRun = hasFlag(flags, "dry-run");
  const initialize = hasFlag(flags, "initialize");
  const initializeOptions = resolveInitializeOptions(getStringFlag(flags, "initialize-options"));
  const fide = resolveFideContext(process.cwd());
  const configPath = resolveGraphConfigPath(graphKey, process.cwd());
  const previous = readLocalProjectGraph(graphKey);

  validateGraphStoreConfig(graphKey, graph);
  const result = getResultState(previous, graph);

  if (!dryRun) {
    await writeLocalProjectGraph(graphKey, graph);
  }

  let initialized:
    | { type: "sqlite"; file: string }
    | null = null;
  if (initialize && !dryRun) {
    const connection = graph.connection;
    const resolveFileBackedPath = (conn: { "fide-path"?: string; "project-path"?: string }): string | null => {
      if (typeof conn["fide-path"] === "string") {
        return conn["fide-path"].startsWith("/")
          ? conn["fide-path"]
          : resolve(fide.fideDir, conn["fide-path"]);
      }
      if (typeof conn["project-path"] === "string") {
        return conn["project-path"].startsWith("/")
          ? conn["project-path"]
          : resolve(fide.root, conn["project-path"]);
      }
      return null;
    };
    if (connection && typeof connection === "object" && !Array.isArray(connection) && connection.type === "sqlite") {
      const sqliteFile = resolveFileBackedPath(
        connection as { "fide-path"?: string; "project-path"?: string },
      );
      if (!sqliteFile) {
        throw new Error("Sqlite graph connection is missing both `fide-path` and `project-path`.");
      }
      if (initializeOptions.dangerously_overwrite) {
        await rm(sqliteFile, { force: true });
      }
      await initializeSqliteGraphStorage({
        file: sqliteFile,
      });
      initialized = { type: "sqlite", file: sqliteFile };
    } else {
      throw new Error("`fide graph connect --initialize` supports sqlite graphs only.");
    }
  }

  const payload = okResponse(GRAPH_CONNECT_SCOPE, {
    dryRun,
    initialize,
    initializeOptions,
    targetScope: "local",
    root: fide.root,
    fideDir: fide.fideDir,
    configPath,
    graphKey,
    result,
    graph,
    ...(initialized ? { initialized } : {}),
  }, {
    command: "fide graph connect",
    next: dryRun
      ? { apply: `fide graph connect --graph-key ${graphKey}` }
      : {
          ...(initialized ? {} : { initialize: `fide graph connect --graph-key ${graphKey} --initialize` }),
          sync: "fide start",
        },
  });

  if (useJson) {
    printJson(payload);
  } else {
    console.log(formatPretty(GRAPH_CONNECT_SCOPE, payload) ?? JSON.stringify(payload, null, 2));
  }
  return 0;
}
