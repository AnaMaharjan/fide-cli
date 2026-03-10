import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getStringFlag } from "./args.js";

type LegacyFideSettings = {
  graphDir?: string;
};

type LocalGraphTargetSettings = {
  type: "local";
  dir?: string;
};

type PostgresGraphTargetSettings = {
  type: "postgres";
  databaseUrl?: string;
  databaseUrlEnv?: string;
  schema?: string;
  statementsTable?: string;
};

type FideSettings = LegacyFideSettings & {
  graphTargets?: Record<string, LocalGraphTargetSettings | PostgresGraphTargetSettings>;
};

export type ResolvedLocalGraphTarget = {
  type: "local";
  root: string;
  configuredFromSettings: boolean;
};

export type ResolvedPostgresGraphTarget = {
  type: "postgres";
  key: string | null;
  configuredFromSettings: boolean;
  databaseUrl: string | null;
  databaseUrlSource: "flag" | "env" | "settings" | "settings-env" | null;
  databaseUrlEnv: string | null;
  schema: string;
  statementsTable: string;
};

export type ResolvedGraphTarget = ResolvedLocalGraphTarget | ResolvedPostgresGraphTarget;

function readSettings(root: string): FideSettings | null {
  const settingsPath = resolve(root, ".fide", "settings.json");
  if (!existsSync(settingsPath)) return null;

  const raw = readFileSync(settingsPath, "utf8");
  return JSON.parse(raw) as FideSettings;
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
): { key: string | null; target: LocalGraphTargetSettings | PostgresGraphTargetSettings | null } {
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
  configuredTarget?: LocalGraphTargetSettings | null,
): ResolvedLocalGraphTarget {
  const target = getStringFlag(flags, "target");
  if (target && isPathLikeTarget(target)) {
    return { type: "local", root: resolve(process.cwd(), target), configuredFromSettings: false };
  }

  const cwd = process.cwd();
  if (configuredTarget?.dir) {
    return {
      type: "local",
      root: resolve(cwd, configuredTarget.dir),
      configuredFromSettings: true,
    };
  }

  if (settings?.graphDir) {
    return {
      type: "local",
      root: resolve(cwd, settings.graphDir),
      configuredFromSettings: true,
    };
  }

  return { type: "local", root: cwd, configuredFromSettings: false };
}

function resolvePostgresTarget(
  settings: FideSettings | null,
  key: string,
): ResolvedPostgresGraphTarget {
  const configured = getConfiguredGraphTarget(settings, key);
  const postgresTarget = configured.target?.type === "postgres" ? configured.target : null;
  if (!postgresTarget) {
    throw new Error(`Graph target "${key}" is not a postgres target.`);
  }
  const envKey = postgresTarget?.databaseUrlEnv ?? null;
  const databaseUrlFromSettings = postgresTarget?.databaseUrl ?? null;
  const schema = postgresTarget?.schema ?? "public";
  const statementsTable = postgresTarget?.statementsTable ?? "statements";

  if (process.env.FIDE_GRAPH_DATABASE_URL) {
    return {
      type: "postgres",
      key: configured.key,
      configuredFromSettings: true,
      databaseUrl: process.env.FIDE_GRAPH_DATABASE_URL,
      databaseUrlSource: "env",
      databaseUrlEnv: "FIDE_GRAPH_DATABASE_URL",
      schema,
      statementsTable,
    };
  }

  if (envKey && process.env[envKey]) {
    return {
      type: "postgres",
      key: configured.key,
      configuredFromSettings: true,
      databaseUrl: process.env[envKey] ?? null,
      databaseUrlSource: "settings-env",
      databaseUrlEnv: envKey ?? null,
      schema,
      statementsTable,
    };
  }

  if (databaseUrlFromSettings) {
    return {
      type: "postgres",
      key: configured.key,
      configuredFromSettings: true,
      databaseUrl: databaseUrlFromSettings,
      databaseUrlSource: "settings",
      databaseUrlEnv: envKey ?? null,
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
    databaseUrlEnv: envKey ?? null,
    schema,
    statementsTable,
  };
}

/**
 * Resolve the effective graph target.
 *
 * Resolution order:
 * 1. `--target <configured-key>` resolves a configured graph target
 * 2. `--target <path>` resolves a local filesystem target
 * 3. no target flag falls back to local cwd / legacy graphDir
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
    if (configured.target?.type === "local") {
      return resolveLocalTarget(flags, settings, configured.target);
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
    throw new Error("The resolved graph target is postgres, but this command expects a local .fide workspace.");
  }
  return { root: target.root, configuredFromSettings: target.configuredFromSettings };
}
