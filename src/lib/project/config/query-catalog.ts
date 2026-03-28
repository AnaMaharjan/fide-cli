import { ensureFideEnvLoaded, readJsonFile, resolveSettingsPath } from "./fide-dir.js";

export type QueryCatalogSettings = {
  type: "postgres";
  connection?: string;
  schema: string;
};

type QueryCatalogSettingsRoot = {
  workspaceId?: string;
  queryCatalogs?: Record<string, QueryCatalogSettings>;
};

export type ResolvedQueryCatalog = {
  type: "postgres";
  key: string;
  databaseUrl: string | null;
  databaseUrlSource: "connection" | "connection-env" | null;
  databaseUrlEnv: string | null;
  schema: string;
};

function readSettings(root: string = process.cwd()): QueryCatalogSettingsRoot | null {
  return readJsonFile<QueryCatalogSettingsRoot>(resolveSettingsPath(root));
}

export function listConfiguredQueryCatalogKeys(root: string = process.cwd()): string[] {
  const settings = readSettings(root);
  validateQueryCatalogSettings(settings ?? {});
  return Object.keys(settings?.queryCatalogs ?? {});
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

export function validateQueryCatalogSettings(settings: QueryCatalogSettingsRoot): void {
  const queryCatalogs = settings.queryCatalogs ?? {};
  for (const [key, store] of Object.entries(queryCatalogs)) {
    if (store.type !== "postgres") {
      throw new Error(`Query catalog "${key}" must use type "postgres".`);
    }
    if (typeof store.schema !== "string" || store.schema.trim().length === 0) {
      throw new Error(
        `Query catalog "${key}" must include schema in settings.json. Suggested schema: "fide_graph_queries".`,
      );
    }
  }
}

export function resolveQueryCatalog(flags: Map<string, string | boolean>, root: string = process.cwd()): ResolvedQueryCatalog {
  ensureFideEnvLoaded();
  const settings = readSettings(root);
  validateQueryCatalogSettings(settings ?? {});
  const requested = typeof flags.get("query-catalog") === "string" ? String(flags.get("query-catalog")) : null;
  const key = requested ?? Object.keys(settings?.queryCatalogs ?? {})[0] ?? null;
  if (!key) {
    throw new Error("No configured query catalog found in settings.json.");
  }

  const store = settings?.queryCatalogs?.[key];
  if (!store) {
    throw new Error(`Unknown query catalog in settings.json: ${key}`);
  }

  const resolved = resolveDatabaseUrl(store.connection);
  return {
    type: "postgres",
    key,
    schema: store.schema,
    ...resolved,
  };
}
