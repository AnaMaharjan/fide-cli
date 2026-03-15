import { ensureFideEnvLoaded, readJsonFile, resolveSettingsPath } from "../fide-dir.js";

export type QueryStoreSettings = {
  type: "postgres";
  connection?: string;
  schema: string;
};

type QuerySettingsRoot = {
  queryStores?: Record<string, QueryStoreSettings>;
};

export type ResolvedQueryStore = {
  type: "postgres";
  key: string;
  databaseUrl: string | null;
  databaseUrlSource: "connection" | "connection-env" | null;
  databaseUrlEnv: string | null;
  schema: string;
};

function readSettings(root: string = process.cwd()): QuerySettingsRoot | null {
  return readJsonFile<QuerySettingsRoot>(resolveSettingsPath(root));
}

function resolveDatabaseUrl(connection: string | undefined): {
  databaseUrl: string | null;
  databaseUrlSource: "connection" | "connection-env" | null;
  databaseUrlEnv: string | null;
} {
  if (!connection) {
    return { databaseUrl: null, databaseUrlSource: null, databaseUrlEnv: null };
  }
  if (connection.startsWith("postgres://") || connection.startsWith("postgresql://")) {
    return { databaseUrl: connection, databaseUrlSource: "connection", databaseUrlEnv: null };
  }
  const envValue = process.env[connection] ?? null;
  return {
    databaseUrl: envValue,
    databaseUrlSource: envValue ? "connection-env" : null,
    databaseUrlEnv: connection,
  };
}

export function validateQueryStoreSettings(settings: QuerySettingsRoot): void {
  const queryStores = settings.queryStores ?? {};
  for (const [key, store] of Object.entries(queryStores)) {
    if (store.type !== "postgres") {
      throw new Error(`Query store "${key}" must use type "postgres".`);
    }
    if (typeof store.schema !== "string" || store.schema.trim().length === 0) {
      throw new Error(`Query store "${key}" must include schema in settings.json.`);
    }
  }
}

export function resolveQueryStore(flags: Map<string, string | boolean>, root: string = process.cwd()): ResolvedQueryStore {
  ensureFideEnvLoaded();
  const settings = readSettings(root);
  validateQueryStoreSettings(settings ?? {});
  const requested = typeof flags.get("query-store") === "string" ? String(flags.get("query-store")) : null;
  const key = requested ?? Object.keys(settings?.queryStores ?? {})[0] ?? null;
  if (!key) {
    throw new Error("No configured query store found in settings.json.");
  }

  const store = settings?.queryStores?.[key];
  if (!store) {
    throw new Error(`Unknown query store in settings.json: ${key}`);
  }

  const resolved = resolveDatabaseUrl(store.connection);
  return {
    type: "postgres",
    key,
    schema: store.schema,
    ...resolved,
  };
}
