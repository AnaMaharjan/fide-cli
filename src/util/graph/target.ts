import { dirname, resolve } from "node:path";
import { getStringFlag } from "../args.js";
import { ensureFideEnvLoaded, readJsonFile, resolveFideDir as resolveConfiguredFideDir, resolveSettingsPath, resolveFideRoot } from "../fide-dir.js";
import { type QueryStoreSettings, validateQueryStoreSettings } from "../query/target.js";

export type GraphRecipeStep = {
  from: string;
  sql?: string;
  fromDateUTC?: string;
  toDateUTC?: string;
};

export type GraphRecipe = GraphRecipeStep[];
export const GRAPH_STATEMENTS_TABLE = "statements";
export const GRAPH_REFERENCE_IDENTIFIERS_TABLE = "reference_identifiers";
export const GRAPH_ROOTS_TABLE = "roots";
export const GRAPH_STATEMENT_ROOTS_TABLE = "statement_roots";

export type GraphRunState = {
  metadata?: {
    lastRunAt?: string;
    lastRunStatementsAdded?: number;
  };
};

type GraphRunStateCompat = GraphRunState & {
  lastRunAt?: string;
  lastRunStatementCount?: number;
  lastRunStatementsAdded?: number;
};

type PostgresGraphStoreSettings = {
  type: "postgres";
  connection?: string;
  schema: string;
  recipe?: GraphRecipe;
  metadata?: GraphRunState["metadata"];
};

type SqliteGraphStoreSettings = {
  type: "sqlite";
  connection: string;
  gitignore?: boolean;
  recipe?: GraphRecipe;
  metadata?: GraphRunState["metadata"];
};

type FideJsonlGraphStoreSettings = {
  type: "fide-jsonl";
  connection: string;
  recipe?: GraphRecipe;
  metadata?: GraphRunState["metadata"];
};

export type FideSettings = {
  graphs?: Record<string, PostgresGraphStoreSettings | SqliteGraphStoreSettings | FideJsonlGraphStoreSettings>;
  queryStores?: Record<string, QueryStoreSettings>;
};

export type ResolvedLocalGraphTarget = {
  type: "local";
  root: string;
  connection: string | null;
  gitignore: boolean | null;
  configuredFromSettings: boolean;
  key: string | null;
  recipe: GraphRecipe | null;
  runState: GraphRunState | null;
};

export type ResolvedPostgresStatementStore = {
  type: "postgres";
  key: string | null;
  configuredFromSettings: boolean;
  databaseUrl: string | null;
  databaseUrlSource: "connection" | "connection-env" | null;
  databaseUrlEnv: string | null;
  schema: string;
  recipe: GraphRecipe | null;
  runState: GraphRunState | null;
};

export type ResolvedSqliteStatementStore = {
  type: "sqlite";
  key: string | null;
  configuredFromSettings: boolean;
  file: string;
  gitignore: boolean | null;
  recipe: GraphRecipe | null;
  runState: GraphRunState | null;
};

export type ResolvedFideJsonlStatementStore = {
  type: "fide-jsonl";
  key: string | null;
  configuredFromSettings: boolean;
  dir: string;
  recipe: GraphRecipe | null;
  runState: GraphRunState | null;
};

export type ResolvedStatementStore = ResolvedPostgresStatementStore | ResolvedSqliteStatementStore | ResolvedFideJsonlStatementStore;
export type ResolvedStoreTarget = ResolvedStatementStore;
export type ResolvedGraphTarget = ResolvedLocalGraphTarget;

function readSettings(root: string): FideSettings | null {
  const settingsPath = resolveSettingsPath(root);
  const settings = readJsonFile<FideSettings>(settingsPath);
  if (!settings) return null;
  validateGraphSettings(settings);
  return settings;
}

function normalizeGraphRunState(state: GraphRunStateCompat | null | undefined): GraphRunState | null {
  if (!state) return null;
  if (state.metadata) return state;
  if (state.lastRunAt || typeof state.lastRunStatementsAdded === "number" || typeof state.lastRunStatementCount === "number") {
    return {
      metadata: {
        lastRunAt: state.lastRunAt,
        lastRunStatementsAdded: state.lastRunStatementsAdded ?? state.lastRunStatementCount,
      },
    };
  }
  return null;
}

function validateRecipe(
  key: string,
  recipe: GraphRecipe,
  graphs: Record<string, PostgresGraphStoreSettings | SqliteGraphStoreSettings | FideJsonlGraphStoreSettings>,
): void {
  if (!Array.isArray(recipe) || recipe.length === 0) {
    throw new Error(`Store "${key}" recipe must be a non-empty array of recipe steps.`);
  }

  for (const [index, step] of recipe.entries()) {
    if (!step || typeof step !== "object") {
      throw new Error(`Store "${key}" recipe step ${index + 1} must be an object.`);
    }
    if (typeof step.from !== "string" || step.from.trim().length === 0) {
      throw new Error(`Store "${key}" recipe step ${index + 1} must include a non-empty from store id.`);
    }
    if (step.from === key) {
      throw new Error(`Store "${key}" recipe step ${index + 1} cannot reference itself.`);
    }
    const source = graphs[step.from];
    if (!source) {
      throw new Error(`Store "${key}" recipe step ${index + 1} references unknown store "${step.from}". Define it in settings.json first.`);
    }
    if (source.type === "fide-jsonl") {
      if (step.fromDateUTC != null && (typeof step.fromDateUTC !== "string" || step.fromDateUTC.trim().length === 0)) {
        throw new Error(`Store "${key}" recipe step ${index + 1} has an invalid fromDateUTC value.`);
      }
      if (step.toDateUTC != null && (typeof step.toDateUTC !== "string" || step.toDateUTC.trim().length === 0)) {
        throw new Error(`Store "${key}" recipe step ${index + 1} has an invalid toDateUTC value.`);
      }
      if (step.sql != null && (typeof step.sql !== "string" || step.sql.trim().length === 0)) {
        throw new Error(`Store "${key}" recipe step ${index + 1} has an invalid sql value.`);
      }
      continue;
    }
    if (step.fromDateUTC != null || step.toDateUTC != null) {
      throw new Error(`Store "${key}" recipe step ${index + 1} may only use fromDateUTC/toDateUTC with fide-jsonl sources.`);
    }
    if (typeof step.sql !== "string" || step.sql.trim().length === 0) {
      throw new Error(`Store "${key}" recipe step ${index + 1} must include a non-empty SQL string.`);
    }
  }
}

export function validateGraphSettings(settings: FideSettings): void {
  const graphs = settings.graphs ?? {};
  for (const [key, store] of Object.entries(graphs)) {
    if (store.type === "postgres" && (typeof store.schema !== "string" || store.schema.trim().length === 0)) {
      throw new Error(
        `Graph "${key}" must include schema in settings.json. Suggested schema: "fide_graph".`,
      );
    }
    if ((store.type === "sqlite" || store.type === "fide-jsonl") && (typeof store.connection !== "string" || store.connection.trim().length === 0)) {
      throw new Error(`Graph "${key}" must include connection in settings.json.`);
    }
    if (!store.recipe) continue;
    validateRecipe(key, store.recipe, graphs);
  }
  validateQueryStoreSettings(settings);
}

export function listConfiguredStoreTargetKeys(root: string = process.cwd()): string[] {
  const settings = readSettings(root);
  return Object.keys(settings?.graphs ?? {});
}

function getConfiguredGraphStore(
  settings: FideSettings | null,
  key: string,
): { key: string | null; store: PostgresGraphStoreSettings | SqliteGraphStoreSettings | FideJsonlGraphStoreSettings | null } {
  const store = settings?.graphs?.[key] ?? null;
  if (!store) {
    throw new Error(`Unknown graph in settings.json: ${key}`);
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
      recipe: null,
      runState: null,
    };
  }

  return {
    type: "local",
    key: null,
    root: resolveFideRoot(process.cwd()),
    connection: null,
    gitignore: null,
    configuredFromSettings: Boolean(process.env.FIDE_DIR),
    recipe: null,
    runState: null,
  };
}

function resolvePathWithinFideDir(connection: string): string {
  const fideDir = resolveConfiguredFideDir(process.cwd());
  return connection.startsWith("/")
    ? connection
    : resolve(fideDir, connection);
}

function resolvePostgresStore(settings: FideSettings | null, key: string): ResolvedPostgresStatementStore {
  ensureFideEnvLoaded();
  const configured = getConfiguredGraphStore(settings, key);
  const postgresStore = configured.store?.type === "postgres" ? configured.store : null;
  if (!postgresStore) {
    throw new Error(`Store "${key}" is not a postgres store.`);
  }
  const connection = postgresStore.connection ?? null;
  const schema = postgresStore.schema;
  const recipe = postgresStore.recipe ?? null;
  const runState = normalizeGraphRunState(postgresStore.metadata ? { metadata: postgresStore.metadata } : null);

  if (connection?.startsWith("postgres://") || connection?.startsWith("postgresql://")) {
    return {
      type: "postgres",
      key: configured.key,
      configuredFromSettings: true,
      databaseUrl: connection,
      databaseUrlSource: "connection",
      databaseUrlEnv: null,
      schema,
      recipe,
      runState,
    };
  }

  if (connection && process.env[connection]) {
    return {
      type: "postgres",
      key: configured.key,
      configuredFromSettings: true,
      databaseUrl: process.env[connection] ?? null,
      databaseUrlSource: "connection-env",
      databaseUrlEnv: connection,
      schema,
      recipe,
      runState,
    };
  }

  return {
    type: "postgres",
    key: configured.key,
    configuredFromSettings: true,
    databaseUrl: null,
    databaseUrlSource: null,
    databaseUrlEnv: connection,
    schema,
    recipe,
    runState,
  };
}

function resolveSqliteStore(settings: FideSettings | null, key: string): ResolvedSqliteStatementStore {
  ensureFideEnvLoaded();
  const configured = getConfiguredGraphStore(settings, key);
  const sqliteStore = configured.store?.type === "sqlite" ? configured.store : null;
  if (!sqliteStore) {
    throw new Error(`Store "${key}" is not a sqlite store.`);
  }
  const rawConnection = sqliteStore.connection;
  const resolvedConnection = process.env[rawConnection] ?? rawConnection;
  return {
    type: "sqlite",
    key: configured.key,
    configuredFromSettings: true,
    file: resolvePathWithinFideDir(resolvedConnection),
    gitignore: typeof sqliteStore.gitignore === "boolean" ? sqliteStore.gitignore : null,
    recipe: sqliteStore.recipe ?? null,
    runState: normalizeGraphRunState(sqliteStore.metadata ? { metadata: sqliteStore.metadata } : null),
  };
}

function resolveFideJsonlStore(settings: FideSettings | null, key: string): ResolvedFideJsonlStatementStore {
  const configured = getConfiguredGraphStore(settings, key);
  const jsonlStore = configured.store?.type === "fide-jsonl" ? configured.store : null;
  if (!jsonlStore) {
    throw new Error(`Store "${key}" is not a fide-jsonl store.`);
  }
  return {
    type: "fide-jsonl",
    key: configured.key,
    configuredFromSettings: true,
    dir: resolvePathWithinFideDir(jsonlStore.connection),
    recipe: jsonlStore.recipe ?? null,
    runState: normalizeGraphRunState(jsonlStore.metadata ? { metadata: jsonlStore.metadata } : null),
  };
}

export function resolveStoreTarget(flags: Map<string, string | boolean>): ResolvedStoreTarget {
  const settings = readSettings(process.cwd());
  const graph = getStringFlag(flags, "graph") ?? getStringFlag(flags, "store");
  if (!graph) {
    throw new Error("Missing required flag: --graph <name>.");
  }

  const configured = getConfiguredGraphStore(settings, graph);
  if (configured.store?.type === "postgres") return resolvePostgresStore(settings, graph);
  if (configured.store?.type === "sqlite") return resolveSqliteStore(settings, graph);
  if (configured.store?.type === "fide-jsonl") return resolveFideJsonlStore(settings, graph);
  throw new Error(`Unsupported graph type for "${graph}".`);
}

export function resolveGraphTarget(flags: Map<string, string | boolean>): ResolvedGraphTarget {
  return resolveLocalTarget(flags);
}

export function resolveFideDir(flags: Map<string, string | boolean>): { root: string; configuredFromSettings: boolean } {
  const target = resolveGraphTarget(flags);
  return { root: target.root, configuredFromSettings: target.configuredFromSettings };
}
