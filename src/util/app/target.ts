import { ensureWorkspaceEnvLoaded, readJsonFile, resolveSettingsPath } from "../workspace.js";

export type AppPostgresTargetSettings = {
  type: "postgres";
  connection?: string;
  schema: string;
};

export type FideAppSettings = {
  appTargets?: Record<string, AppPostgresTargetSettings>;
};

export type ResolvedPostgresAppTarget = {
  type: "postgres";
  key: string | null;
  configuredFromSettings: boolean;
  databaseUrl: string | null;
  databaseUrlSource: "connection" | "connection-env" | null;
  databaseUrlEnv: string | null;
  schema: string;
};

export function validateAppSettings(settings: FideAppSettings): void {
  const appTargets = settings.appTargets ?? {};
  for (const [key, target] of Object.entries(appTargets)) {
    if (target.type !== "postgres") {
      throw new Error(`App target "${key}" must use type "postgres".`);
    }
    if (typeof target.schema !== "string" || target.schema.trim().length === 0) {
      throw new Error(`App target "${key}" must include schema in settings.json.`);
    }
  }
}

function readSettings(root: string): FideAppSettings | null {
  const settingsPath = resolveSettingsPath(root);
  const settings = readJsonFile<FideAppSettings>(settingsPath);
  if (!settings) return null;
  validateAppSettings(settings);
  return settings;
}

export function listConfiguredAppTargetKeys(root: string = process.cwd()): string[] {
  const settings = readSettings(root);
  return Object.keys(settings?.appTargets ?? {});
}

export function resolveAppTarget(
  flags: Map<string, string | boolean>,
  root: string = process.cwd(),
): ResolvedPostgresAppTarget {
  ensureWorkspaceEnvLoaded();
  const settings = readSettings(root);
  const requestedKey = typeof flags.get("target") === "string"
    ? String(flags.get("target"))
    : null;
  const key = requestedKey ?? Object.keys(settings?.appTargets ?? {})[0] ?? null;

  if (!key) {
    throw new Error("No configured app target found in settings.json. Run `fide app init` first.");
  }

  const target = settings?.appTargets?.[key] ?? null;
  if (!target) {
    throw new Error(`Unknown app target in settings.json: ${key}`);
  }

  const connection = target.connection ?? null;
  const databaseUrl =
    connection &&
    !connection.startsWith("postgres://") &&
    !connection.startsWith("postgresql://") &&
    process.env[connection]
      ? (process.env[connection] as string)
      : connection;

  return {
    type: "postgres",
    key,
    configuredFromSettings: true,
    databaseUrl: databaseUrl ?? null,
    databaseUrlSource: !connection
      ? null
      : connection.startsWith("postgres://") || connection.startsWith("postgresql://")
        ? "connection"
        : process.env[connection]
          ? "connection-env"
          : "connection",
    databaseUrlEnv:
      connection &&
      !connection.startsWith("postgres://") &&
      !connection.startsWith("postgresql://")
        ? connection
        : null,
    schema: target.schema,
  };
}
