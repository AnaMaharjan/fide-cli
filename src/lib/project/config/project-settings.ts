import { existsSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  ensureFideEnvLoaded,
  readJsonFile,
  resolveGraphConfigPath,
  resolveFideDir,
  resolveGraphsDir,
  resolveSettingsPath,
  resolveFideRoot,
} from "./fide-dir.js";
import { type QueryCatalogSettings, validateQueryCatalogSettings } from "./query-catalog.js";

export const GRAPH_STATEMENTS_TABLE = "statements";
export const GRAPH_REFERENCE_IDENTIFIERS_TABLE = "reference_identifiers";
export const GRAPH_STATEMENT_BATCHES_TABLE = "statement_batches";
export const GRAPH_BATCHES_TABLE = "batches";

type PostgresConnectionSettings = {
  url?: string;
  host?: string;
  port?: number;
  database?: string;
  user?: string;
  password?: string;
  sslmode?: "disable" | "allow" | "prefer" | "require" | "verify-ca" | "verify-full";
  schema: string;
};

type SqliteConnectionSettings = {
  type: "sqlite";
  "fide-path"?: string;
  "project-path"?: string;
};

type DuckdbConnectionSettings = {
  type: "duckdb";
  "fide-path"?: string;
  "project-path"?: string;
};

type PostgresGraphStoreSettings = {
  connection?: PostgresConnectionSettings & { type: "postgres" };
};

type SqliteGraphStoreSettings = {
  connection: SqliteConnectionSettings;
  gitignore?: boolean;
};

type DuckdbGraphStoreSettings = {
  connection: DuckdbConnectionSettings;
  gitignore?: boolean;
};

type FideJsonlGraphStoreSettings = {
  type: "fide-jsonl";
  connection: string;
};

export type FideSettings = {
  workspaceId?: string;
  graphs?: Record<string, GraphStoreSettings>;
  queryCatalogs?: Record<string, QueryCatalogSettings>;
};

export type GraphStoreSettings =
  | PostgresGraphStoreSettings
  | SqliteGraphStoreSettings
  | DuckdbGraphStoreSettings
  | FideJsonlGraphStoreSettings;

export type ResolvedLocalGraphTarget = {
  type: "local";
  root: string;
  connection: string | null;
  gitignore: boolean | null;
  configuredFromSettings: boolean;
  key: string | null;
};

export type ResolvedPostgresGraphStore = {
  type: "postgres";
  key: string | null;
  configuredFromSettings: boolean;
  databaseUrl: string | null;
  databaseUrlSource: "connection" | "connection-env" | null;
  databaseUrlEnv: string | null;
  schema: string;
};

export type ResolvedSqliteGraphStore = {
  type: "sqlite";
  key: string | null;
  configuredFromSettings: boolean;
  file: string;
  gitignore: boolean | null;
};

export type ResolvedDuckdbGraphStore = {
  type: "duckdb";
  key: string | null;
  configuredFromSettings: boolean;
  file: string;
  gitignore: boolean | null;
};

export type ResolvedFideJsonlGraphStore = {
  type: "fide-jsonl";
  key: string | null;
  configuredFromSettings: boolean;
  dir: string;
};

export type ResolvedGraphStore =
  | ResolvedPostgresGraphStore
  | ResolvedSqliteGraphStore
  | ResolvedDuckdbGraphStore
  | ResolvedFideJsonlGraphStore;
export type ResolvedStoreTarget = ResolvedGraphStore;
export type ResolvedGraphTarget = ResolvedLocalGraphTarget;

function getStringFlag(flags: Map<string, string | boolean>, name: string): string | null {
  return typeof flags.get(name) === "string" ? String(flags.get(name)) : null;
}

function readSettings(root: string): FideSettings | null {
  const settingsPath = resolveSettingsPath(root);
  const settings = readJsonFile<FideSettings>(settingsPath);
  if (!settings) return null;
  validateGraphSettings(settings);
  return settings;
}

function readConfiguredGraphStores(root: string): Record<string, GraphStoreSettings> {
  const graphsDir = resolveGraphsDir(root);
  if (!existsSync(graphsDir)) return {};

  const stores = Object.fromEntries(
    readdirSync(graphsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .flatMap((entry) => {
        const graphKey = entry.name;
        const config = readJsonFile<GraphStoreSettings>(resolveGraphConfigPath(graphKey, root));
        return config ? [[graphKey, config] as const] : [];
      }),
  );

  validateGraphSettings({ graphs: stores } as FideSettings & { graphs: Record<string, GraphStoreSettings> });
  return stores;
}

function getConfiguredStoreType(store: unknown): "postgres" | "sqlite" | "duckdb" | "fide-jsonl" | null {
  if (!store || typeof store !== "object" || Array.isArray(store)) return null;
  const graphStore = store as { type?: unknown; connection?: unknown };
  if (graphStore.connection && typeof graphStore.connection === "object" && !Array.isArray(graphStore.connection)) {
    const connection = graphStore.connection as { type?: unknown };
    if (connection.type === "postgres" || connection.type === "sqlite" || connection.type === "duckdb") {
      return connection.type;
    }
  }
  if (graphStore.type === "postgres" || graphStore.type === "sqlite" || graphStore.type === "fide-jsonl") {
    return graphStore.type;
  }
  return null;
}

function isPostgresGraphStoreSettings(
  store: GraphStoreSettings | null,
): store is PostgresGraphStoreSettings {
  return getConfiguredStoreType(store) === "postgres";
}

function isSqliteGraphStoreSettings(
  store: GraphStoreSettings | null,
): store is SqliteGraphStoreSettings {
  return getConfiguredStoreType(store) === "sqlite";
}

function isDuckdbGraphStoreSettings(
  store: GraphStoreSettings | null,
): store is DuckdbGraphStoreSettings {
  return getConfiguredStoreType(store) === "duckdb";
}

function isFideJsonlGraphStoreSettings(
  store: GraphStoreSettings | null,
): store is FideJsonlGraphStoreSettings {
  return getConfiguredStoreType(store) === "fide-jsonl";
}

export function validateGraphStoreConfig(key: string, store: GraphStoreSettings): void {
  const storeType = getConfiguredStoreType(store);
  if (storeType === "postgres") {
    if (!isPostgresGraphStoreSettings(store)) {
      throw new Error(`Graph "${key}" has an invalid postgres configuration in .fide/graphs/${key}/config.json.`);
    }
    const connection = store.connection;
    if (!connection || typeof connection !== "object" || Array.isArray(connection)) {
      throw new Error(`Graph "${key}" must include connection.schema plus either connection.url or postgres connection parts in .fide/graphs/${key}/config.json.`);
    }
    const connectionType = (connection as { type?: unknown }).type;
    if (connectionType !== undefined && connectionType !== "postgres") {
      throw new Error(`Graph "${key}" has an invalid postgres connection.type in .fide/graphs/${key}/config.json.`);
    }
    if (typeof connection.schema !== "string" || connection.schema.trim().length === 0) {
      throw new Error(
        `Graph "${key}" must include connection.schema in .fide/graphs/${key}/config.json. Suggested schema: "fide_graph".`,
      );
    }
    const hasUrl = typeof connection.url === "string" && connection.url.trim().length > 0;
    const hasHost = typeof connection.host === "string" && connection.host.trim().length > 0;
    const hasDatabase = typeof connection.database === "string" && connection.database.trim().length > 0;
    if (!hasUrl && (!hasHost || !hasDatabase)) {
      throw new Error(
        `Graph "${key}" must include either connection.url or both connection.host and connection.database in .fide/graphs/${key}/config.json.`,
      );
    }
    return;
  }
  if (storeType === "sqlite") {
    if (!isSqliteGraphStoreSettings(store)) {
      throw new Error(`Graph "${key}" has an invalid sqlite configuration in .fide/graphs/${key}/config.json.`);
    }
    const connection = store.connection;
    if (!connection || typeof connection !== "object" || Array.isArray(connection)) {
      throw new Error(`Graph "${key}" must include connection.fide-path or connection.project-path in .fide/graphs/${key}/config.json.`);
    }
    const connectionType = (connection as { type?: unknown }).type;
    if (connectionType !== undefined && connectionType !== "sqlite") {
      throw new Error(`Graph "${key}" has an invalid sqlite connection.type in .fide/graphs/${key}/config.json.`);
    }
    const hasFidePath = typeof connection["fide-path"] === "string" && connection["fide-path"].trim().length > 0;
    const hasProjectPath = typeof connection["project-path"] === "string" && connection["project-path"].trim().length > 0;
    if (!hasFidePath && !hasProjectPath) {
      throw new Error(`Graph "${key}" must include connection.fide-path or connection.project-path in .fide/graphs/${key}/config.json.`);
    }
    return;
  }
  if (storeType === "duckdb") {
    if (!isDuckdbGraphStoreSettings(store)) {
      throw new Error(`Graph "${key}" has an invalid duckdb configuration in .fide/graphs/${key}/config.json.`);
    }
    const connection = store.connection;
    if (!connection || typeof connection !== "object" || Array.isArray(connection)) {
      throw new Error(`Graph "${key}" must include connection.fide-path or connection.project-path in .fide/graphs/${key}/config.json.`);
    }
    const connectionType = (connection as { type?: unknown }).type;
    if (connectionType !== undefined && connectionType !== "duckdb") {
      throw new Error(`Graph "${key}" has an invalid duckdb connection.type in .fide/graphs/${key}/config.json.`);
    }
    const hasFidePath = typeof connection["fide-path"] === "string" && connection["fide-path"].trim().length > 0;
    const hasProjectPath = typeof connection["project-path"] === "string" && connection["project-path"].trim().length > 0;
    if (!hasFidePath && !hasProjectPath) {
      throw new Error(`Graph "${key}" must include connection.fide-path or connection.project-path in .fide/graphs/${key}/config.json.`);
    }
    return;
  }
  if (storeType === "fide-jsonl") {
    if (typeof store.connection !== "string" || store.connection.trim().length === 0) {
      throw new Error(`Graph "${key}" must include connection in .fide/graphs/${key}/config.json.`);
    }
    return;
  }
  throw new Error(`Graph "${key}" has an unsupported connection type in .fide/graphs/${key}/config.json.`);
}

export function validateGraphSettings(settings: FideSettings): void {
  const graphs = settings.graphs ?? {};
  for (const [key, store] of Object.entries(graphs)) {
    validateGraphStoreConfig(key, store);
  }
  validateQueryCatalogSettings(settings);
}

export function listConfiguredStoreTargetKeys(root: string = process.cwd()): string[] {
  return Object.keys(readConfiguredGraphStores(root));
}

function getConfiguredGraphStore(
  root: string,
  key: string,
): { key: string | null; store: GraphStoreSettings | null } {
  const store = readConfiguredGraphStores(root)[key] ?? null;
  if (!store) {
    throw new Error(`Unknown graph in .fide/graphs: ${key}`);
  }
  return { key, store };
}

function resolveLocalTarget(flags: Map<string, string | boolean>): ResolvedLocalGraphTarget {
  if (flags.has("target")) {
    throw new Error("`--target` is no longer supported for `fide graph` commands. Use `--fide-dir <path>` for a local .fide directory override.");
  }
  const fideDir = getStringFlag(flags, "fide-dir");
  if (fideDir) {
    return {
      type: "local",
      key: null,
      root: dirname(resolve(process.cwd(), fideDir)),
      connection: fideDir,
      gitignore: null,
      configuredFromSettings: false,
    };
  }

  return {
    type: "local",
    key: null,
    root: resolveFideRoot(process.cwd()),
    connection: null,
    gitignore: null,
    configuredFromSettings: Boolean(process.env.FIDE_DIR),
  };
}

function resolvePathWithinFideDir(connection: string): string {
  const fideDir = resolveFideDir(process.cwd());
  return connection.startsWith("/")
    ? connection
    : resolve(fideDir, connection);
}

function resolvePathFromProjectRoot(connection: string): string {
  return connection.startsWith("/")
    ? connection
    : resolve(resolveFideRoot(process.cwd()), connection);
}

function resolvePostgresStore(key: string): ResolvedPostgresGraphStore {
  ensureFideEnvLoaded();
  const configured = getConfiguredGraphStore(process.cwd(), key);
  const postgresStore = isPostgresGraphStoreSettings(configured.store) ? configured.store : null;
  if (!postgresStore) {
    throw new Error(`Store "${key}" is not a postgres store.`);
  }
  const connection = postgresStore.connection ?? null;
  const connectionUrl = connection?.url ?? null;
  const schema = connection?.schema;

  if (typeof schema !== "string" || schema.length === 0) {
    throw new Error(`Store "${key}" is missing connection.schema in .fide/graphs/${key}/config.json.`);
  }

  if (connectionUrl?.startsWith("postgres://") || connectionUrl?.startsWith("postgresql://")) {
    return {
      type: "postgres",
      key: configured.key,
      configuredFromSettings: true,
      databaseUrl: connectionUrl,
      databaseUrlSource: "connection",
      databaseUrlEnv: null,
      schema,
    };
  }

  if (connectionUrl && process.env[connectionUrl]) {
    return {
      type: "postgres",
      key: configured.key,
      configuredFromSettings: true,
      databaseUrl: process.env[connectionUrl] ?? null,
      databaseUrlSource: "connection-env",
      databaseUrlEnv: connectionUrl,
      schema,
    };
  }

  if (
    connection
    && typeof connection.host === "string"
    && connection.host.length > 0
    && typeof connection.database === "string"
    && connection.database.length > 0
  ) {
    const url = new URL("postgres://localhost");
    url.hostname = connection.host;
    if (typeof connection.port === "number" && Number.isFinite(connection.port)) {
      url.port = String(connection.port);
    }
    if (typeof connection.user === "string" && connection.user.length > 0) {
      url.username = connection.user;
    }
    if (typeof connection.password === "string" && connection.password.length > 0) {
      url.password = connection.password;
    }
    if (typeof connection.database === "string" && connection.database.length > 0) {
      url.pathname = `/${connection.database}`;
    }
    if (typeof connection.sslmode === "string" && connection.sslmode.length > 0) {
      url.searchParams.set("sslmode", connection.sslmode);
    }
    return {
      type: "postgres",
      key: configured.key,
      configuredFromSettings: true,
      databaseUrl: url.toString(),
      databaseUrlSource: "connection",
      databaseUrlEnv: null,
      schema,
    };
  }

  return {
    type: "postgres",
    key: configured.key,
    configuredFromSettings: true,
    databaseUrl: null,
    databaseUrlSource: null,
    databaseUrlEnv: connectionUrl,
    schema,
  };
}

function resolveSqliteStore(key: string): ResolvedSqliteGraphStore {
  ensureFideEnvLoaded();
  const configured = getConfiguredGraphStore(process.cwd(), key);
  const sqliteStore = isSqliteGraphStoreSettings(configured.store) ? configured.store : null;
  if (!sqliteStore) {
    throw new Error(`Store "${key}" is not a sqlite store.`);
  }
  const rawConnection = sqliteStore.connection["fide-path"] ?? sqliteStore.connection["project-path"];
  if (!rawConnection) {
    throw new Error(`Store "${key}" is missing sqlite connection.fide-path or connection.project-path.`);
  }
  const resolvedConnection = process.env[rawConnection] ?? rawConnection;
  return {
    type: "sqlite",
    key: configured.key,
    configuredFromSettings: true,
    file: sqliteStore.connection["fide-path"]
      ? resolvePathWithinFideDir(resolvedConnection)
      : resolvePathFromProjectRoot(resolvedConnection),
    gitignore: typeof sqliteStore.gitignore === "boolean" ? sqliteStore.gitignore : null,
  };
}

function resolveDuckdbStore(key: string): ResolvedDuckdbGraphStore {
  ensureFideEnvLoaded();
  const configured = getConfiguredGraphStore(process.cwd(), key);
  const duckdbStore = isDuckdbGraphStoreSettings(configured.store) ? configured.store : null;
  if (!duckdbStore) {
    throw new Error(`Store "${key}" is not a duckdb store.`);
  }
  const rawConnection = duckdbStore.connection["fide-path"] ?? duckdbStore.connection["project-path"];
  if (!rawConnection) {
    throw new Error(`Store "${key}" is missing duckdb connection.fide-path or connection.project-path.`);
  }
  const resolvedConnection = process.env[rawConnection] ?? rawConnection;
  return {
    type: "duckdb",
    key: configured.key,
    configuredFromSettings: true,
    file: duckdbStore.connection["fide-path"]
      ? resolvePathWithinFideDir(resolvedConnection)
      : resolvePathFromProjectRoot(resolvedConnection),
    gitignore: typeof duckdbStore.gitignore === "boolean" ? duckdbStore.gitignore : null,
  };
}

function resolveFideJsonlStore(key: string): ResolvedFideJsonlGraphStore {
  const configured = getConfiguredGraphStore(process.cwd(), key);
  const jsonlStore = isFideJsonlGraphStoreSettings(configured.store) ? configured.store : null;
  if (!jsonlStore) {
    throw new Error(`Store "${key}" is not a fide-jsonl store.`);
  }
  return {
    type: "fide-jsonl",
    key: configured.key,
    configuredFromSettings: true,
    dir: resolvePathWithinFideDir(jsonlStore.connection),
  };
}

export function resolveStoreTarget(flags: Map<string, string | boolean>): ResolvedStoreTarget {
  const graph = getStringFlag(flags, "graph") ?? getStringFlag(flags, "store");
  if (!graph) {
    throw new Error("Missing required flag: --graph <key>.");
  }

  const configured = getConfiguredGraphStore(process.cwd(), graph);
  const storeType = getConfiguredStoreType(configured.store);
  if (storeType === "postgres") return resolvePostgresStore(graph);
  if (storeType === "sqlite") return resolveSqliteStore(graph);
  if (storeType === "duckdb") return resolveDuckdbStore(graph);
  if (storeType === "fide-jsonl") return resolveFideJsonlStore(graph);
  throw new Error(`Unsupported graph type for "${graph}".`);
}

export function resolveGraphTarget(flags: Map<string, string | boolean>): ResolvedGraphTarget {
  return resolveLocalTarget(flags);
}

export function resolveFideDirFromFlags(flags: Map<string, string | boolean>): { root: string; configuredFromSettings: boolean } {
  const target = resolveGraphTarget(flags);
  return { root: target.root, configuredFromSettings: target.configuredFromSettings };
}
