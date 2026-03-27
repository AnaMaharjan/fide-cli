import { validateGraphStoreConfig } from "@chris-test/graph";
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
  readLocalProjectGraph,
  writeLocalProjectGraph,
  type LocalProjectGraphRecord,
} from "../../util/project/graph-config.js";
import { resolveFideContext, resolveGraphConfigPath } from "../../util/project/fide-dir.js";

export const graphConnectCommand = defineCommand({
  surface: "graph.connect",
  command: "fide graph connect",
  outputType: "GraphConnectOutput",
  summary: "Create or update a graph connection in this project",
  usage: [
    "fide graph connect --graph-key <key> --connection '<json>'",
  ],
  paramOrder: [
    "graph-key",
    "connection",
    "dry-run",
    "pretty",
  ],
  params: {
    "graph-key": { kind: "string", required: true, description: "Graph key", valueLabel: "<key>" },
    connection: { kind: "string", description: "Connection JSON for this graph type", valueLabel: "'<json>'" },
    "dry-run": { kind: "boolean", description: "Show the local create or update without writing config.json" },
    pretty: { kind: "boolean", shorthand: "-p", description: "Human-readable output" },
  },
  examples: [
    "fide graph connect --graph-key primary --connection '{\"type\":\"postgres\",\"url\":\"FIDE_GRAPH_DATABASE_URL\",\"schema\":\"fide_graph\"}'",
    "fide graph connect --graph-key local --connection '{\"type\":\"sqlite\",\"path\":\".fide/graph.sqlite\"}'",
  ],
  notes: [
    "Writes a graph definition into `.fide/graphs/<graphKey>/config.json` in this project.",
    "Postgres `--connection` expects JSON like `{\"type\":\"postgres\",\"url\":\"ENV_OR_URL\",\"schema\":\"fide_graph\"}`.",
    "Sqlite `--connection` expects JSON like `{\"type\":\"sqlite\",\"path\":\".fide/graph.sqlite\"}`.",
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

function assertGraphConnectType(value: string | null | undefined): "postgres" | "sqlite" | null {
  if (value === "postgres" || value === "sqlite") {
    return value;
  }
  return null;
}

function readExistingGraphType(existing: LocalProjectGraphRecord | null): "postgres" | "sqlite" | null {
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

function resolvePostgresConnection(
  connectionInput: unknown,
  existingConnection: unknown,
): { type: "postgres"; url?: string; schema: string } {
  const nextConnection = connectionInput ?? existingConnection;
  if (!nextConnection || typeof nextConnection !== "object" || Array.isArray(nextConnection)) {
    throw new Error(
      "Postgres graphs require --connection '{\"url\":\"...\",\"schema\":\"...\"}' when creating or updating without an existing connection object.",
    );
  }
  const connection = nextConnection as Record<string, unknown>;
  if (connection.type !== undefined && connection.type !== "postgres") {
    throw new Error("Postgres graph connection JSON must include `type: \"postgres\"` when `type` is provided.");
  }
  if (typeof connection.schema !== "string" || connection.schema.trim().length === 0) {
    throw new Error(
      "Postgres graph connection JSON must include a non-empty `schema` string.",
    );
  }
  if (connection.url !== undefined && typeof connection.url !== "string") {
    throw new Error("Postgres graph connection `url` must be a string when provided.");
  }
  return {
    type: "postgres",
    ...(typeof connection.url === "string" ? { url: connection.url } : {}),
    schema: connection.schema,
  };
}

function resolveSqliteConnection(
  connectionInput: unknown,
  existingConnection: unknown,
): { type: "sqlite"; path: string } {
  const nextConnection = connectionInput ?? existingConnection ?? null;
  if (!nextConnection || typeof nextConnection !== "object" || Array.isArray(nextConnection)) {
    throw new Error(
      "Sqlite graphs require --connection '{\"path\":\"...\"}' when creating or updating without an existing connection object.",
    );
  }
  const connection = nextConnection as Record<string, unknown>;
  if (connection.type !== undefined && connection.type !== "sqlite") {
    throw new Error("Sqlite graph connection JSON must include `type: \"sqlite\"` when `type` is provided.");
  }
  if (typeof connection.path !== "string" || connection.path.trim().length === 0) {
    throw new Error("Sqlite graph connection JSON must include a non-empty `path` string.");
  }
  return { type: "sqlite", path: connection.path };
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
      graph: { connection: { type: "postgres", schema: "fide_graph" } },
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

  if (type === "postgres") {
    const nextConnection = resolvePostgresConnection(connectionInput, existing?.connection);
    return {
      flags,
      graphKey,
      graph: {
        ...Object.fromEntries(Object.entries(existing ?? {}).filter(([key]) => key !== "type")),
        connection: nextConnection,
      },
    };
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
  const fide = resolveFideContext(process.cwd());
  const configPath = resolveGraphConfigPath(graphKey, process.cwd());
  const previous = readLocalProjectGraph(graphKey);

  validateGraphStoreConfig(graphKey, graph);
  const result = getResultState(previous, graph);

  if (!dryRun) {
    await writeLocalProjectGraph(graphKey, graph);
  }

  const payload = okResponse(GRAPH_CONNECT_SCOPE, {
    dryRun,
    targetScope: "local",
    root: fide.root,
    fideDir: fide.fideDir,
    configPath,
    graphKey,
    result,
    graph,
  }, {
    command: "fide graph connect",
    next: dryRun
      ? { apply: `fide graph connect --graph-key ${graphKey}` }
      : { sync: "fide start" },
  });

  if (useJson) {
    printJson(payload);
  } else {
    console.log(formatPretty(GRAPH_CONNECT_SCOPE, payload) ?? JSON.stringify(payload, null, 2));
  }
  return 0;
}
