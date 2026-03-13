import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { getStringFlag } from "./args.js";

type FideSettings = {
  fideDir?: string;
  graphTargets?: Record<string, PostgresGraphTargetSettings | SqliteGraphTargetSettings>;
};

type PostgresGraphTargetSettings = {
  type: "postgres";
  connection?: string;
  schema?: string;
  statementsTable?: string;
};

type SqliteGraphTargetSettings = {
  type: "sqlite";
  connection: string;
  gitignore?: boolean;
};

export type ResolvedJsonlGraphTarget = {
  type: "jsonl";
  root: string;
  configuredFromSettings: boolean;
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
};

export type ResolvedSqliteGraphTarget = {
  type: "sqlite";
  key: string | null;
  configuredFromSettings: boolean;
  file: string;
  gitignore: boolean | null;
};

export type ResolvedGraphTarget = ResolvedJsonlGraphTarget | ResolvedPostgresGraphTarget | ResolvedSqliteGraphTarget;

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
  return JSON.parse(raw) as FideSettings;
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
): { key: string | null; target: PostgresGraphTargetSettings | SqliteGraphTargetSettings | null } {
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

function resolveJsonlTarget(
  flags: Map<string, string | boolean>,
  settings: FideSettings | null,
): ResolvedJsonlGraphTarget {
  const target = getStringFlag(flags, "target");
  if (target && isPathLikeTarget(target)) {
    return { type: "jsonl", root: resolve(process.cwd(), target), configuredFromSettings: false };
  }

  const cwd = process.cwd();
  if (settings?.fideDir) {
    return {
      type: "jsonl",
      root: dirname(resolve(cwd, settings.fideDir)),
      configuredFromSettings: true,
    };
  }

  return { type: "jsonl", root: cwd, configuredFromSettings: false };
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
  const schema = postgresTarget?.schema ?? "fide_graph";
  const statementsTable = postgresTarget?.statementsTable ?? "statements";

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
  };
}

/**
 * Resolve the effective graph target.
 *
 * Resolution order:
 * 1. `--target <configured-key>` resolves a configured graph target
 * 2. `--target <path>` resolves a local filesystem target
 * 3. no target falls back to cwd / configured fideDir
 */
export function resolveGraphTarget(flags: Map<string, string | boolean>): ResolvedGraphTarget {
  const settings = readSettings(process.cwd());
  const target = getStringFlag(flags, "target");

  if (target && !isPathLikeTarget(target)) {
    warnIfTargetNameMatchesLocalPath(target);
    const configured = getConfiguredGraphTarget(settings, target);
    if (configured.target?.type === "postgres") {
      return resolvePostgresTarget(settings, target);
    }
    if (configured.target?.type === "sqlite") {
      return resolveSqliteTarget(settings, target);
    }
  }

  return resolveJsonlTarget(flags, settings);
}

/**
 * Backward-compatible jsonl target resolver for existing command code.
 */
export function resolveFideDir(
  flags: Map<string, string | boolean>,
): { root: string; configuredFromSettings: boolean } {
  const target = resolveGraphTarget(flags);
  if (target.type !== "jsonl") {
    throw new Error(`The resolved graph target is ${target.type}, but this command expects a jsonl .fide workspace.`);
  }
  return { root: target.root, configuredFromSettings: target.configuredFromSettings };
}
