import postgres from "postgres";

export type CreatePgClientOptions = {
  suppressNotices?: boolean;
  searchPath?: string;
};

export function createPgClient(connectionString: string, options: CreatePgClientOptions = {}) {
  if (!connectionString) {
    throw new Error("Missing postgres connection string.");
  }

  return postgres(connectionString, {
    max: options.searchPath ? 1 : 20,
    prepare: false,
    idle_timeout: 30,
    connect_timeout: 10,
    onnotice: options.suppressNotices ? () => {} : undefined,
  });
}
