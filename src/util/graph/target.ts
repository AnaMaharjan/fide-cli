import { dirname, resolve } from "node:path";
import { getStringFlag } from "../args.js";
import { ensureWorkspaceEnvLoaded, readJsonFile, resolveSettingsPath, resolveWorkspaceRoot } from "../workspace.js";

export type FideSettings = {
  storeTargets?: Record<string, PostgresStoreTargetSettings | SqliteStoreTargetSettings>;
  appTargets?: Record<string, { type: "postgres"; connection?: string; schema: string }>;
};

export type GraphRecipeStep = {
  from: string;
  sql: string;
};

export type GraphRecipe = GraphRecipeStep[];
export const GRAPH_STATEMENTS_TABLE = "statements";
export const GRAPH_REFERENCE_IDENTIFIERS_TABLE = "reference_identifiers";

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

type PostgresStoreTargetSettings = {
  type: "postgres";
  connection?: string;
  schema: string;
  recipe?: GraphRecipe;
  metadata?: GraphRunState["metadata"];
};

type SqliteStoreTargetSettings = {
  type: "sqlite";
  connection: string;
  gitignore?: boolean;
  recipe?: GraphRecipe;
  metadata?: GraphRunState["metadata"];
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

export type ResolvedPostgresGraphTarget = {
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

export type ResolvedSqliteGraphTarget = {
  type: "sqlite";
  key: string | null;
  configuredFromSettings: boolean;
  file: string;
  gitignore: boolean | null;
  recipe: GraphRecipe | null;
  runState: GraphRunState | null;
};

export type ResolvedGraphTarget = ResolvedLocalGraphTarget | ResolvedPostgresGraphTarget | ResolvedSqliteGraphTarget;
export type ResolvedStoreTarget = ResolvedPostgresGraphTarget | ResolvedSqliteGraphTarget;

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
  storeTargets: Record<string, PostgresStoreTargetSettings | SqliteStoreTargetSettings>,
): void {
  if (!Array.isArray(recipe) || recipe.length === 0) {
    throw new Error(`Store target "${key}" recipe must be a non-empty array of { from, sql } steps.`);
  }

  for (const [index, step] of recipe.entries()) {
    if (!step || typeof step !== "object") {
      throw new Error(`Store target "${key}" recipe step ${index + 1} must be an object with from and sql.`);
    }
    if (typeof step.from !== "string" || step.from.trim().length === 0) {
      throw new Error(`Store target "${key}" recipe step ${index + 1} must include a non-empty from store id.`);
    }
    if (typeof step.sql !== "string" || step.sql.trim().length === 0) {
      throw new Error(`Store target "${key}" recipe step ${index + 1} must include a non-empty SQL string.`);
    }
    if (step.from === key) {
      throw new Error(`Store target "${key}" recipe step ${index + 1} cannot reference itself.`);
    }
    if (!storeTargets[step.from]) {
      throw new Error(
        `Store target "${key}" recipe step ${index + 1} references unknown store target "${step.from}". Define it in settings.json first.`,
      );
    }
  }
}

export function validateGraphSettings(settings: FideSettings): void {
  const storeTargets = settings.storeTargets ?? {};
  for (const [key, target] of Object.entries(storeTargets)) {
    if (target.type === "postgres" && (typeof target.schema !== "string" || target.schema.trim().length === 0)) {
      throw new Error(`Store target "${key}" must include schema in settings.json.`);
    }
    if (target.type === "sqlite" && (typeof target.connection !== "string" || target.connection.trim().length === 0)) {
      throw new Error(`Store target "${key}" must include connection in settings.json.`);
    }
    if (!target.recipe) continue;
    validateRecipe(key, target.recipe, storeTargets);
  }
}

export function listConfiguredStoreTargetKeys(root: string = process.cwd()): string[] {
  const settings = readSettings(root);
  return Object.keys(settings?.storeTargets ?? {});
}

function getConfiguredStoreTarget(
  settings: FideSettings | null,
  key: string,
): { key: string | null; target: PostgresStoreTargetSettings | SqliteStoreTargetSettings | null } {
  const target = settings?.storeTargets?.[key] ?? null;
  if (!target) {
    throw new Error(`Unknown store target in settings.json: ${key}`);
  }
  return { key, target };
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
    root: resolveWorkspaceRoot(process.cwd()),
    connection: null,
    gitignore: null,
    configuredFromSettings: Boolean(process.env.FIDE_DIR),
    recipe: null,
    runState: null,
  };
}

function resolvePostgresTarget(
  settings: FideSettings | null,
  key: string,
): ResolvedPostgresGraphTarget {
  ensureWorkspaceEnvLoaded();
  const configured = getConfiguredStoreTarget(settings, key);
  const postgresTarget = configured.target?.type === "postgres" ? configured.target : null;
  if (!postgresTarget) {
    throw new Error(`Store target "${key}" is not a postgres target.`);
  }
  const connection = postgresTarget.connection ?? null;
  const schema = postgresTarget.schema;
  const recipe = postgresTarget.recipe ?? null;
  const runState = normalizeGraphRunState(postgresTarget.metadata ? { metadata: postgresTarget.metadata } : null);

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

function resolveSqliteTarget(
  settings: FideSettings | null,
  key: string,
): ResolvedSqliteGraphTarget {
  const configured = getConfiguredStoreTarget(settings, key);
  const sqliteTarget = configured.target?.type === "sqlite" ? configured.target : null;
  if (!sqliteTarget) {
    throw new Error(`Store target "${key}" is not a sqlite target.`);
  }
  const connection = sqliteTarget.connection;
  const file = connection.startsWith("/") || connection.startsWith("./") || connection.startsWith("../") || connection.startsWith("~/")
    ? resolve(process.cwd(), connection)
    : process.env[connection]
      ? resolve(process.cwd(), process.env[connection] as string)
      : resolve(process.cwd(), connection);
  return {
    type: "sqlite",
    key: configured.key,
    configuredFromSettings: true,
    file,
    gitignore: typeof sqliteTarget.gitignore === "boolean" ? sqliteTarget.gitignore : null,
    recipe: sqliteTarget.recipe ?? null,
    runState: normalizeGraphRunState(sqliteTarget.metadata ? { metadata: sqliteTarget.metadata } : null),
  };
}

export function resolveStoreTarget(flags: Map<string, string | boolean>): ResolvedStoreTarget {
  const settings = readSettings(process.cwd());
  const store = getStringFlag(flags, "store");
  if (!store) {
    throw new Error("Missing required flag: --store <name>.");
  }

  const configured = getConfiguredStoreTarget(settings, store);
  if (configured.target?.type === "postgres") {
    return resolvePostgresTarget(settings, store);
  }
  if (configured.target?.type === "sqlite") {
    return resolveSqliteTarget(settings, store);
  }
  throw new Error(`Unsupported store target type for "${store}".`);
}

export function resolveGraphTarget(flags: Map<string, string | boolean>): ResolvedGraphTarget {
  return resolveLocalTarget(flags);
}

export function resolveFideDir(flags: Map<string, string | boolean>): { root: string; configuredFromSettings: boolean } {
  const target = resolveGraphTarget(flags);
  if (target.type !== "local") {
    throw new Error(`The resolved graph target is ${target.type}, but this command expects a local .fide workspace.`);
  }
  return { root: target.root, configuredFromSettings: target.configuredFromSettings };
}
