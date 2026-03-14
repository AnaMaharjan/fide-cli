import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { getStringFlag } from "../args.js";

export type FideSettings = {
  graphTargets?: Record<string, LocalGraphTargetSettings | PostgresGraphTargetSettings | SqliteGraphTargetSettings>;
};

export type GraphRecipeStep = {
  from: string;
  sql: string;
};

export type GraphRecipe = GraphRecipeStep[];

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

type PostgresGraphTargetSettings = {
  type: "postgres";
  connection?: string;
  schema: string;
  recipe?: GraphRecipe;
  metadata?: GraphRunState["metadata"];
};

type LocalGraphTargetSettings = {
  type: "local";
  connection: string;
  gitignore?: boolean;
  recipe?: GraphRecipe;
  metadata?: GraphRunState["metadata"];
};

type SqliteGraphTargetSettings = {
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
  statementsTable: string;
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

let envLoaded = false;

function ensureGraphEnvLoaded(): void {
  if (envLoaded) return;
  envLoaded = true;

  const envPaths = [
    resolve(process.cwd(), ".env"),
    resolve(process.cwd(), ".env.local"),
  ];

  for (const envPath of envPaths) {
    if (!existsSync(envPath)) continue;
    try {
      process.loadEnvFile(envPath);
    } catch {
      // Ignore malformed/missing env files; explicit process.env always wins.
    }
  }
}

function readSettings(root: string): FideSettings | null {
  const settingsPath = resolve(root, ".fide", "settings.json");
  if (!existsSync(settingsPath)) return null;

  const raw = readFileSync(settingsPath, "utf8");
  const settings = JSON.parse(raw) as FideSettings;
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
  graphTargets: Record<string, LocalGraphTargetSettings | PostgresGraphTargetSettings | SqliteGraphTargetSettings>,
): void {
  if (!Array.isArray(recipe) || recipe.length === 0) {
    throw new Error(`Graph target "${key}" recipe must be a non-empty array of { from, sql } steps.`);
  }

  for (const [index, step] of recipe.entries()) {
    if (!step || typeof step !== "object") {
      throw new Error(`Graph target "${key}" recipe step ${index + 1} must be an object with from and sql.`);
    }
    if (typeof step.from !== "string" || step.from.trim().length === 0) {
      throw new Error(`Graph target "${key}" recipe step ${index + 1} must include a non-empty from graph id.`);
    }
    if (typeof step.sql !== "string" || step.sql.trim().length === 0) {
      throw new Error(`Graph target "${key}" recipe step ${index + 1} must include a non-empty SQL string.`);
    }
    if (step.from === key) {
      throw new Error(`Graph target "${key}" recipe step ${index + 1} cannot reference itself.`);
    }
    if (!graphTargets[step.from]) {
      throw new Error(
        `Graph target "${key}" recipe step ${index + 1} references unknown graph target "${step.from}". Define it in .fide/settings.json first.`,
      );
    }
  }
}

export function validateGraphSettings(settings: FideSettings): void {
  const graphTargets = settings.graphTargets ?? {};
  for (const [key, target] of Object.entries(graphTargets)) {
    if (target.type === "local" && (typeof target.connection !== "string" || target.connection.trim().length === 0)) {
      throw new Error(`Graph target "${key}" must include connection in .fide/settings.json.`);
    }
    if (target.type === "postgres" && (typeof target.schema !== "string" || target.schema.trim().length === 0)) {
      throw new Error(`Graph target "${key}" must include schema in .fide/settings.json.`);
    }
    if (!("recipe" in target) || !target.recipe) continue;
    validateRecipe(key, target.recipe, graphTargets);
  }
}

export function listConfiguredGraphTargetKeys(root: string = process.cwd()): string[] {
  const settings = readSettings(root);
  return Object.keys(settings?.graphTargets ?? {});
}

function isPathLikeTarget(value: string): boolean {
  return (
    value.startsWith("/") ||
    value.startsWith("./") ||
    value.startsWith("../") ||
    value.startsWith("~/") ||
    value.includes("/")
  );
}

function getConfiguredGraphTarget(
  settings: FideSettings | null,
  key: string,
): { key: string | null; target: LocalGraphTargetSettings | PostgresGraphTargetSettings | SqliteGraphTargetSettings | null } {
  const target = settings?.graphTargets?.[key] ?? null;
  if (!target) {
    throw new Error(`Unknown graph target in .fide/settings.json: ${key}`);
  }
  return { key, target };
}

function warnIfTargetNameMatchesLocalPath(value: string): void {
  const maybePath = resolve(process.cwd(), value);
  if (!existsSync(maybePath)) return;
  console.warn(
    `Warning: --target "${value}" matches a local path. Prefix with "./" or "../" to force local, or use --target "${value}" to select the configured target key.`,
  );
}

function resolveLocalTarget(
  flags: Map<string, string | boolean>,
  settings: FideSettings | null,
): ResolvedLocalGraphTarget {
  const target = getStringFlag(flags, "target");
  if (target && isPathLikeTarget(target)) {
    return {
      type: "local",
      key: null,
      root: resolve(process.cwd(), target),
      connection: target,
      gitignore: null,
      configuredFromSettings: false,
      recipe: null,
      runState: null,
    };
  }

  const configuredLocal = settings?.graphTargets?.local;
  if (configuredLocal?.type === "local") {
    return {
      type: "local",
      key: "local",
      root: dirname(resolve(process.cwd(), configuredLocal.connection)),
      connection: configuredLocal.connection,
      gitignore: typeof configuredLocal.gitignore === "boolean" ? configuredLocal.gitignore : null,
      configuredFromSettings: true,
      recipe: configuredLocal.recipe ?? null,
      runState: normalizeGraphRunState(configuredLocal.metadata ? { metadata: configuredLocal.metadata } : null),
    };
  }

  return {
    type: "local",
    key: null,
    root: process.cwd(),
    connection: null,
    gitignore: null,
    configuredFromSettings: false,
    recipe: null,
    runState: null,
  };
}

function resolvePostgresTarget(
  settings: FideSettings | null,
  key: string,
): ResolvedPostgresGraphTarget {
  ensureGraphEnvLoaded();
  const configured = getConfiguredGraphTarget(settings, key);
  const postgresTarget = configured.target?.type === "postgres" ? configured.target : null;
  if (!postgresTarget) {
    throw new Error(`Graph target "${key}" is not a postgres target.`);
  }
  const connection = postgresTarget?.connection ?? null;
  const schema = postgresTarget.schema;
  const statementsTable = "statements";
  const recipe = postgresTarget?.recipe ?? null;
  const runState = normalizeGraphRunState(postgresTarget?.metadata ? { metadata: postgresTarget.metadata } : null);

  if (connection?.startsWith("postgres://") || connection?.startsWith("postgresql://")) {
    return {
      type: "postgres",
      key: configured.key,
      configuredFromSettings: true,
      databaseUrl: connection,
      databaseUrlSource: "connection",
      databaseUrlEnv: null,
      schema,
      statementsTable,
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
      statementsTable,
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
    statementsTable,
    recipe,
    runState,
  };
}

function resolveSqliteTarget(
  settings: FideSettings | null,
  key: string,
): ResolvedSqliteGraphTarget {
  const configured = getConfiguredGraphTarget(settings, key);
  const sqliteTarget = configured.target?.type === "sqlite" ? configured.target : null;
  if (!sqliteTarget) {
    throw new Error(`Graph target "${key}" is not a sqlite target.`);
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
    runState: normalizeGraphRunState(sqliteTarget?.metadata ? { metadata: sqliteTarget.metadata } : null),
  };
}

/**
 * Resolve the effective graph target.
 *
 * Resolution order:
 * 1. `--target <configured-key>` resolves a configured graph target
 * 2. `--target <path>` resolves a local filesystem target
 * 3. no target falls back to configured local target or cwd
 */
export function resolveGraphTarget(flags: Map<string, string | boolean>): ResolvedGraphTarget {
  const settings = readSettings(process.cwd());
  const target = getStringFlag(flags, "target");

  if (target && !isPathLikeTarget(target)) {
    warnIfTargetNameMatchesLocalPath(target);
    const configured = getConfiguredGraphTarget(settings, target);
    if (configured.target?.type === "local") {
      return {
        type: "local",
        key: configured.key,
        root: dirname(resolve(process.cwd(), configured.target.connection)),
        connection: configured.target.connection,
        gitignore: typeof configured.target.gitignore === "boolean" ? configured.target.gitignore : null,
        configuredFromSettings: true,
        recipe: configured.target.recipe ?? null,
        runState: normalizeGraphRunState(configured.target.metadata ? { metadata: configured.target.metadata } : null),
      };
    }
    if (configured.target?.type === "postgres") {
      return resolvePostgresTarget(settings, target);
    }
    if (configured.target?.type === "sqlite") {
      return resolveSqliteTarget(settings, target);
    }
  }

  return resolveLocalTarget(flags, settings);
}

/**
 * Backward-compatible local target resolver for existing command code.
 */
export function resolveFideDir(
  flags: Map<string, string | boolean>,
): { root: string; configuredFromSettings: boolean } {
  const target = resolveGraphTarget(flags);
  if (target.type !== "local") {
    throw new Error(`The resolved graph target is ${target.type}, but this command expects a local .fide workspace.`);
  }
  return { root: target.root, configuredFromSettings: target.configuredFromSettings };
}
