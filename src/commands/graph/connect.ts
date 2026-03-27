// fide graph connect --graph-key primary_sb_test --connection '{"type":"postgres","url":"TEST_SB_URL","schema":"fide_graph"}' --initialize

import { resolve } from "node:path";
import { resolveStoreTarget, validateGraphStoreConfig } from "@chris-test/graph";
import { createPgClient } from "@chris-test/graph-storage";
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
import { createPostgresGraphStorageAdapter } from "../../util/project/graph-etl/initialize/adapters/postgres.js";
import { initializeSqliteGraphStorage } from "../../util/project/graph-etl/initialize/adapters/sqlite.js";
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
    "fide graph connect --graph-key <graph-key> --connection <connection-json>",
  ],
  paramOrder: [
    "graph-key",
    "connection",
    "initialize",
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
    "dry-run": { kind: "boolean", description: "Show the local create or update without writing config.json" },
    pretty: { kind: "boolean", shorthand: "-p", description: "Human-readable output" },
  },
  examples: [
    "fide graph connect --graph-key primary --connection '{\"type\":\"postgres\",\"url\":\"FIDE_GRAPH_DATABASE_URL\",\"schema\":\"fide_graph\"}'",
    "fide graph connect --graph-key local --connection '{\"type\":\"sqlite\",\"fide-path\":\"graphs/local/graph.sqlite\"}'",
    "fide graph connect --graph-key local --connection '{\"type\":\"sqlite\",\"path\":\"./tmp/local-graph.sqlite\"}'",
    "fide graph connect --graph-key local --connection '{\"type\":\"sqlite\",\"fide-path\":\"graphs/local/graph.sqlite\"}' --initialize",
  ],
  values: [
    {
      label: "<connection-json>",
      value: '{"type":<connection-json-type>, <connection-json-value>}',
    },
    {
      label: '<connection-json-type> = "postgres"',
      children: [
        {
          label: "<connection-json-value>",
          requires: "`url` or parts",
          children: [
            {
              label: "with `url`",
              children: [
                { label: "url", value: "string", suggested: '"ENV_VAR_NAME or postgres://..."', isRequired: true },
                { label: "schema", value: "string", suggested: '"fide_graph"', isRequired: true },
              ],
            },
            {
              label: "with parts",
              children: [
                { label: "host", value: "string", isRequired: true },
                { label: "database", value: "string", isRequired: true },
                { label: "schema", value: "string", suggested: '"fide_graph"', isRequired: true },
                { label: "port", value: "number" },
                { label: "user", value: "string" },
                { label: "password", value: "string", suggested: '"ENV_VAR_VALUE"' },
                {
                  label: "sslmode",
                  value: ['"disable"', '"allow"', '"prefer"', '"require"', '"verify-ca"', '"verify-full"'],
                },
              ],
            },
          ],
        },
      ],
    },
    {
      label: '<connection-json-type> = "sqlite"',
      children: [
        {
          label: "<connection-json-value>",
          requires: "one of: `fide-path` or `path`, ending in `.sqlite`",
          children: [
            {
              label: "fide-path",
              value: "string",
              suggested: '"/graphs/<graph-key>/graph.sqlite"',
            },
            {
              label: "path",
              value: "string",
              suggested: '"./fide-graphs/<graph-key>/graph.sqlite"',
            },
          ],
        },
      ],
    },
  ],

  notes: [
    "Writes a graph definition into `.fide/graphs/<graphKey>/config.json` in this project.",
    "`fide-path` resolves relative to the active `.fide` directory.",
    "`path` resolves like a normal filesystem path and is relative to the command working directory when not absolute.",
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
const POSTGRES_SSLMODE_VALUES = ["disable", "allow", "prefer", "require", "verify-ca", "verify-full"] as const;
type PostgresSslMode = (typeof POSTGRES_SSLMODE_VALUES)[number];

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
): {
  type: "postgres";
  url?: string;
  host?: string;
  port?: number;
  database?: string;
  user?: string;
  password?: string;
  sslmode?: PostgresSslMode;
  schema: string;
} {
  const nextConnection = connectionInput ?? existingConnection;
  if (!nextConnection || typeof nextConnection !== "object" || Array.isArray(nextConnection)) {
    throw new Error(
      "Postgres graphs require --connection JSON with `schema` plus either `url` or postgres connection parts when creating or updating without an existing connection object.",
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
  for (const field of ["host", "database", "user", "password", "sslmode"] as const) {
    const value = connection[field];
    if (value !== undefined && typeof value !== "string") {
      throw new Error(`Postgres graph connection \`${field}\` must be a string when provided.`);
    }
  }
  const sslmode = typeof connection.sslmode === "string" ? connection.sslmode : undefined;
  if (sslmode !== undefined && !POSTGRES_SSLMODE_VALUES.includes(sslmode as PostgresSslMode)) {
    throw new Error(
      `Postgres graph connection \`sslmode\` must be one of: ${POSTGRES_SSLMODE_VALUES.join(", ")}.`,
    );
  }
  if (connection.port !== undefined && (typeof connection.port !== "number" || !Number.isFinite(connection.port))) {
    throw new Error("Postgres graph connection `port` must be a number when provided.");
  }

  const hasUrl = typeof connection.url === "string" && connection.url.trim().length > 0;
  const hasHost = typeof connection.host === "string" && connection.host.trim().length > 0;
  const hasDatabase = typeof connection.database === "string" && connection.database.trim().length > 0;
  if (!hasUrl && (!hasHost || !hasDatabase)) {
    throw new Error("Postgres graph connection JSON must include either a non-empty `url` string or both non-empty `host` and `database` strings.");
  }
  return {
    type: "postgres",
    ...(typeof connection.url === "string" ? { url: connection.url } : {}),
    ...(typeof connection.host === "string" ? { host: connection.host } : {}),
    ...(typeof connection.port === "number" ? { port: connection.port } : {}),
    ...(typeof connection.database === "string" ? { database: connection.database } : {}),
    ...(typeof connection.user === "string" ? { user: connection.user } : {}),
    ...(typeof connection.password === "string" ? { password: connection.password } : {}),
    ...(sslmode !== undefined ? { sslmode: sslmode as PostgresSslMode } : {}),
    schema: connection.schema,
  };
}

function resolveSqliteConnection(
  connectionInput: unknown,
  existingConnection: unknown,
): { type: "sqlite"; "fide-path"?: string; path?: string } {
  const nextConnection = connectionInput ?? existingConnection ?? null;
  if (!nextConnection || typeof nextConnection !== "object" || Array.isArray(nextConnection)) {
    throw new Error(
      "Sqlite graphs require --connection '{\"fide-path\":\"...\"}' or '{\"path\":\"...\"}' when creating or updating without an existing connection object.",
    );
  }
  const connection = nextConnection as Record<string, unknown>;
  if (connection.type !== undefined && connection.type !== "sqlite") {
    throw new Error("Sqlite graph connection JSON must include `type: \"sqlite\"` when `type` is provided.");
  }
  const fidePath = typeof connection["fide-path"] === "string" ? connection["fide-path"] : null;
  const path = typeof connection.path === "string" ? connection.path : null;
  if ((!fidePath || fidePath.trim().length === 0) && (!path || path.trim().length === 0)) {
    throw new Error("Sqlite graph connection JSON must include a non-empty `fide-path` or `path` string.");
  }
  return {
    type: "sqlite",
    ...(fidePath && fidePath.trim().length > 0 ? { "fide-path": fidePath } : {}),
    ...(path && path.trim().length > 0 ? { path } : {}),
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
  const initialize = hasFlag(flags, "initialize");
  const fide = resolveFideContext(process.cwd());
  const configPath = resolveGraphConfigPath(graphKey, process.cwd());
  const previous = readLocalProjectGraph(graphKey);

  validateGraphStoreConfig(graphKey, graph);
  const result = getResultState(previous, graph);

  if (!dryRun) {
    await writeLocalProjectGraph(graphKey, graph);
  }

  let initialized: { type: "sqlite"; file: string } | { type: "postgres"; schema: string } | null = null;
  if (initialize && !dryRun) {
    const connection = graph.connection;
    if (connection && typeof connection === "object" && !Array.isArray(connection) && connection.type === "sqlite") {
      const sqliteFile = typeof connection["fide-path"] === "string"
        ? (connection["fide-path"].startsWith("/")
          ? connection["fide-path"]
          : resolve(fide.fideDir, connection["fide-path"]))
        : (typeof connection.path === "string"
          ? (connection.path.startsWith("/")
            ? connection.path
            : resolve(process.cwd(), connection.path))
          : null);
      if (!sqliteFile) {
        throw new Error("Sqlite graph connection is missing both `fide-path` and `path`.");
      }
      await initializeSqliteGraphStorage({ file: sqliteFile });
      initialized = { type: "sqlite", file: sqliteFile };
    } else if (connection && typeof connection === "object" && !Array.isArray(connection) && connection.type === "postgres") {
      const target = resolveStoreTarget(new Map<string, string | boolean>([["graph", graphKey]]));
      if (target.type !== "postgres") {
        throw new Error(`Graph "${graphKey}" did not resolve to a postgres store after writing config.`);
      }
      if (!target.databaseUrl) {
        throw new Error(
          `Missing postgres connection for graph "${graphKey}". Configure connection.url in .fide/graphs/${graphKey}/config.json or set the referenced env var.`,
        );
      }
      const adapter = createPostgresGraphStorageAdapter({ schemaName: target.schema });
      const client = createPgClient(target.databaseUrl, { suppressNotices: true });
      try {
        for (const statement of adapter.createStatements) {
          await client.unsafe(statement);
        }
      } finally {
        await client.end({ timeout: 1 });
      }
      initialized = { type: "postgres", schema: target.schema };
    } else {
      throw new Error("`fide graph connect --initialize` currently supports sqlite and postgres graphs only.");
    }
  }

  const payload = okResponse(GRAPH_CONNECT_SCOPE, {
    dryRun,
    initialize,
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
