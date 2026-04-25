// fide graph connect --graph-key primary_sb_test --connection '{"type":"postgres","url":"TEST_SB_URL","schema":"fide_graph"}' --initialize --initialize-options '{"dangerously_overwrite":true}'

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
  createPgClient,
  createPostgresGraphStorageAdapter,
  initializeDuckdbGraphStorage,
  initializeSqliteGraphStorage,
} from "@chris-test/graph";
import {
  readLocalProjectGraph,
  writeLocalProjectGraph,
  type LocalProjectGraphRecord,
} from "../../lib/project/config/graph-config.js";
import { resolveFideContext, resolveGraphConfigPath } from "../../lib/project/config/fide-dir.js";
import { resolveStoreTarget, validateGraphStoreConfig } from "../../lib/project/config/project-settings.js";

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
    "fide graph connect --graph-key primary --connection '{\"type\":\"postgres\",\"url\":\"FIDE_GRAPH_DATABASE_URL\",\"schema\":\"fide_graph\"}'",
    "fide graph connect --graph-key local --connection '{\"type\":\"sqlite\",\"fide-path\":\"graphs/local/graph.sqlite\"}'",
    "fide graph connect --graph-key local --connection '{\"type\":\"sqlite\",\"project-path\":\"tmp/local-graph.sqlite\"}'",
    "fide graph connect --graph-key local --connection '{\"type\":\"sqlite\",\"fide-path\":\"graphs/local/graph.sqlite\"}' --initialize",
    "fide graph connect --graph-key local --connection '{\"type\":\"sqlite\",\"fide-path\":\"graphs/local/graph.sqlite\"}' --initialize --initialize-options '{\"dangerously_overwrite\":true}'",
    "fide graph connect --graph-key local --connection '{\"type\":\"duckdb\",\"fide-path\":\"graphs/local/graph.duckdb\"}'",
    "fide graph connect --graph-key local --connection '{\"type\":\"duckdb\",\"fide-path\":\"graphs/local/graph.duckdb\"}' --initialize",
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
    {
      label: '<connection-json-type> = "duckdb"',
      children: [
        {
          label: "<connection-json-value>",
          requires: "one of: `fide-path` or `project-path`, ending in `.duckdb`",
          children: [
            {
              label: "fide-path",
              value: "string",
              suggested: '"/graphs/<graph-key>/graph.duckdb"',
            },
            {
              label: "project-path",
              value: "string",
              suggested: '"fide-graphs/<graph-key>/graph.duckdb"',
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
const POSTGRES_SSLMODE_VALUES = ["disable", "allow", "prefer", "require", "verify-ca", "verify-full"] as const;
type PostgresSslMode = (typeof POSTGRES_SSLMODE_VALUES)[number];
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

function assertGraphConnectType(value: string | null | undefined): "postgres" | "sqlite" | "duckdb" | null {
  if (value === "postgres" || value === "sqlite" || value === "duckdb") {
    return value;
  }
  return null;
}

function readExistingGraphType(existing: LocalProjectGraphRecord | null): "postgres" | "sqlite" | "duckdb" | null {
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

function resolveDuckdbConnection(
  connectionInput: unknown,
  existingConnection: unknown,
): { type: "duckdb"; "fide-path"?: string; "project-path"?: string } {
  const nextConnection = connectionInput ?? existingConnection ?? null;
  if (!nextConnection || typeof nextConnection !== "object" || Array.isArray(nextConnection)) {
    throw new Error(
      "Duckdb graphs require --connection '{\"fide-path\":\"...\"}' or '{\"project-path\":\"...\"}' when creating or updating without an existing connection object.",
    );
  }
  const connection = nextConnection as Record<string, unknown>;
  if (connection.type !== undefined && connection.type !== "duckdb") {
    throw new Error("Duckdb graph connection JSON must include `type: \"duckdb\"` when `type` is provided.");
  }
  const fidePath = typeof connection["fide-path"] === "string" ? connection["fide-path"] : null;
  const projectPath = typeof connection["project-path"] === "string" ? connection["project-path"] : null;
  if ((!fidePath || fidePath.trim().length === 0) && (!projectPath || projectPath.trim().length === 0)) {
    throw new Error("Duckdb graph connection JSON must include a non-empty `fide-path` or `project-path` string.");
  }
  return {
    type: "duckdb",
    ...(fidePath && fidePath.trim().length > 0 ? { "fide-path": fidePath } : {}),
    ...(projectPath && projectPath.trim().length > 0 ? { "project-path": projectPath } : {}),
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

  if (type === "duckdb") {
    const connection = resolveDuckdbConnection(connectionInput, existing?.connection);
    return {
      flags,
      graphKey,
      graph: {
        ...Object.fromEntries(Object.entries(existing ?? {}).filter(([key]) => key !== "type")),
        connection,
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
    | { type: "duckdb"; file: string }
    | { type: "postgres"; schema: string }
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
    } else if (connection && typeof connection === "object" && !Array.isArray(connection) && connection.type === "duckdb") {
      const duckdbFile = resolveFileBackedPath(
        connection as { "fide-path"?: string; "project-path"?: string },
      );
      if (!duckdbFile) {
        throw new Error("Duckdb graph connection is missing both `fide-path` and `project-path`.");
      }
      if (initializeOptions.dangerously_overwrite) {
        await rm(duckdbFile, { force: true });
      }
      await initializeDuckdbGraphStorage({
        file: duckdbFile,
      });
      initialized = { type: "duckdb", file: duckdbFile };
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
      const adapter = createPostgresGraphStorageAdapter({
        schemaName: target.schema,
      });
      const client = createPgClient(target.databaseUrl, { suppressNotices: true });
      try {
        if (initializeOptions.dangerously_overwrite) {
          await client.unsafe(`DROP SCHEMA IF EXISTS "${target.schema.replaceAll("\"", "\"\"")}" CASCADE;`);
        }
        for (const statement of adapter.createStatements) {
          await client.unsafe(statement);
        }
      } finally {
        await client.end({ timeout: 1 });
      }
      initialized = { type: "postgres", schema: target.schema };
    } else {
      throw new Error("`fide graph connect --initialize` currently supports sqlite, duckdb, and postgres graphs only.");
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
