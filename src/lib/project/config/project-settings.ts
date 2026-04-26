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
export const GRAPH_STATEMENT_BATCHES_TABLE = "batches";
export const GRAPH_BATCHES_TABLE = "statement_batches";

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

type SqliteGraphStoreSettings = {
  connection: SqliteConnectionSettings;
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
  | SqliteGraphStoreSettings
  | FideJsonlGraphStoreSettings;

export type ResolvedLocalGraphTarget = {
  type: "local";
  root: string;
  connection: string | null;
  gitignore: boolean | null;
  configuredFromSettings: boolean;
  key: string | null;
};

export type ResolvedSqliteGraphStore = {
  type: "sqlite";
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
  | ResolvedSqliteGraphStore
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

  const supportedStores = Object.fromEntries(
    Object.entries(stores).filter(([, store]) => {
      const type = getConfiguredStoreType(store);
      return type === "sqlite" || type === "fide-jsonl";
    }),
  );
  validateGraphSettings({ graphs: supportedStores } as FideSettings & { graphs: Record<string, GraphStoreSettings> });
  return supportedStores;
}

function getConfiguredStoreType(store: unknown): "sqlite" | "fide-jsonl" | null {
  if (!store || typeof store !== "object" || Array.isArray(store)) return null;
  const graphStore = store as { type?: unknown; connection?: unknown };
  if (graphStore.connection && typeof graphStore.connection === "object" && !Array.isArray(graphStore.connection)) {
    const connection = graphStore.connection as { type?: unknown };
    if (connection.type === "sqlite") {
      return connection.type;
    }
  }
  if (graphStore.type === "sqlite" || graphStore.type === "fide-jsonl") {
    return graphStore.type;
  }
  return null;
}

function isSqliteGraphStoreSettings(
  store: GraphStoreSettings | null,
): store is SqliteGraphStoreSettings {
  return getConfiguredStoreType(store) === "sqlite";
}


function isFideJsonlGraphStoreSettings(
  store: GraphStoreSettings | null,
): store is FideJsonlGraphStoreSettings {
  return getConfiguredStoreType(store) === "fide-jsonl";
}

export function validateGraphStoreConfig(key: string, store: GraphStoreSettings): void {
  const storeType = getConfiguredStoreType(store);
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
  if (storeType === "sqlite") return resolveSqliteStore(graph);
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
