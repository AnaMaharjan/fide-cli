import { resolve } from "node:path";
import { readStdinUtf8 } from "../graph/shared.js";
import { getStringFlag, hasFlag, parseArgs, shouldUseJsonOutput } from "../../util/command/args.js";
import { booleanKeysFromCommand, mergeBooleanKeySets } from "../../util/command/command-metadata.js";
import { readUtf8 } from "../../util/command/io.js";
import {
  getLocalFideWarnings,
  type LocalQueryDefinition,
  parseLocalQueryFilePath,
  readLocalQueries,
  resolveGraphTarget,
  resolveQueriesDir,
  resolveStoreTarget,
} from "@chris-test/graph";
import { resolveGraphConfigPath } from "../../util/project/fide-dir.js";
import { assertGraphKey, assertQueryName } from "../../util/ids/selectors.js";

export type GraphQueryScope = { targetScope: "local" };

let querySqlParseBooleanKeysCache: ReadonlySet<string> | undefined;

function rejectDeprecatedFideDir(flags: Map<string, string | boolean>, command: string): void {
  if (!flags.has("fide-dir")) return;
  throw new Error(`\`${command}\` no longer supports \`--fide-dir\`. Run the command from the target project root or set \`FIDE_DIR\` in the environment.`);
}

async function querySqlParseBooleanKeys(): Promise<ReadonlySet<string>> {
  if (!querySqlParseBooleanKeysCache) {
    const [{ querySaveCommand }, { queryLoadCommand }] = await Promise.all([
      import("./save.js"),
      import("./load.js"),
    ]);
    querySqlParseBooleanKeysCache = mergeBooleanKeySets(
      booleanKeysFromCommand(querySaveCommand),
      booleanKeysFromCommand(queryLoadCommand),
    );
  }
  return querySqlParseBooleanKeysCache;
}

export async function resolveQuerySql(args: string[]): Promise<{ parsed: ReturnType<typeof parseArgs>; sql: string }> {
  const parsed = parseArgs(args, { booleanKeys: await querySqlParseBooleanKeys() });
  const flags = parsed.flags;
  const filePath = getStringFlag(flags, "file");
  const useStdin = hasFlag(flags, "stdin");
  const stdinAvailable = process.stdin.isTTY === false;
  const inlineSql = parsed.positionals.join(" ").trim();

  if (filePath) return { parsed, sql: await readUtf8(filePath) };
  if (useStdin) return { parsed, sql: await readStdinUtf8() };
  if (inlineSql.length > 0) return { parsed, sql: inlineSql };
  if (stdinAvailable) return { parsed, sql: await readStdinUtf8() };
  return { parsed, sql: "" };
}

export function resolveQueryFileSelector(
  root: string,
  filePath: string,
): { graphKey: string; name: string } {
  return parseLocalQueryFilePath(root, resolve(filePath));
}

export function requireQueryFilePath(flags: Map<string, string | boolean>): string {
  const filePath = getStringFlag(flags, "file");
  if (!filePath) throw new Error("Missing required flag: --file <query.sql>.");
  return filePath;
}

export function parseQueryFileDescription(content: string): { description: string | null; sql: string } {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  let index = 0;
  let description: string | null = null;

  while (index < lines.length) {
    const line = lines[index] ?? "";
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      index += 1;
      continue;
    }
    const descriptionMatch = /^--\s*description\s*:\s*(.+)$/i.exec(trimmed);
    if (descriptionMatch) {
      description = descriptionMatch[1]?.trim() || null;
      index += 1;
      continue;
    }
    break;
  }

  const sql = lines.slice(index).join("\n").trim();
  if (!sql) {
    throw new Error("Query file is missing SQL body.");
  }
  return { description, sql };
}

export async function resolveQuerySaveInput(args: string[]): Promise<{
  parsed: ReturnType<typeof parseArgs>;
  sql: string;
  fileDescription: string | null;
}> {
  const parsed = parseArgs(args, { booleanKeys: await querySqlParseBooleanKeys() });
  const flags = parsed.flags;
  const useStdin = hasFlag(flags, "stdin");
  const stdinAvailable = process.stdin.isTTY === false;
  const inlineSql = parsed.positionals.join(" ").trim();
  const sql = useStdin || (stdinAvailable && inlineSql.length === 0)
    ? await readStdinUtf8()
    : inlineSql;
  return {
    parsed,
    sql,
    fileDescription: null,
  };
}

export function requireSavedQueryName(flags: Map<string, string | boolean>): string {
  const name = getStringFlag(flags, "name");
  if (!name) throw new Error("Missing required flag: --name <query-name>.");
  return assertQueryName(name);
}

export function requireGraphKey(flags: Map<string, string | boolean>): string {
  const graphKey = getStringFlag(flags, "graph-key");
  if (!graphKey) throw new Error("Missing required flag: --graph-key <key>.");
  return assertGraphKey(graphKey);
}

export function assertLocalQueryCommand(flags: Map<string, string | boolean>, command: string): void {
  rejectDeprecatedFideDir(flags, command);
  if (!flags.has("workspace")) {
    return;
  }
  throw new Error(
    `\`${command}\` is local-only. Query definitions are authored in the project and synced by \`fide start\`; hosted query reads and writes are not part of this command surface.`,
  );
}

export async function resolveGraphQueryScope(flags: Map<string, string | boolean>): Promise<GraphQueryScope> {
  rejectDeprecatedFideDir(flags, "fide query load");
  if (flags.has("workspace")) {
    throw new Error("`fide query load` no longer supports hosted query execution. Run against the local project graph/query state.");
  }
  return { targetScope: "local" };
}

export function isWorkspaceScope(_scope: GraphQueryScope): false {
  return false;
}

export function projectQueryMissingError(graphKey: string, name: string): Error {
  return new Error(`Local project query not found: ${graphKey}/${name}. Use \`fide query list\` to inspect local queries.`);
}

export function createCliStructuredError(
  message: string,
  options: {
    hint?: string;
    details?: Record<string, unknown>;
    next?: Record<string, unknown>;
  } = {},
): Error & {
  hint?: string;
  details?: Record<string, unknown>;
  next?: Record<string, unknown>;
} {
  const error = new Error(message) as Error & {
    hint?: string;
    details?: Record<string, unknown>;
    next?: Record<string, unknown>;
  };
  if (options.hint) error.hint = options.hint;
  if (options.details) error.details = options.details;
  if (options.next) error.next = options.next;
  return error;
}

export function renderLocalQueryFileWithDescriptionLine(sql: string, description: string | null): string {
  const normalizedSql = sql.trim();
  const normalizedDescription = description?.trim() ?? "";
  return `-- description: ${normalizedDescription}\n\n${normalizedSql}\n`;
}

export function assertLocalQueryableStore(
  graphKey: string,
  target: ReturnType<typeof resolveStoreTarget>,
  flags: Map<string, string | boolean>,
): Exclude<ReturnType<typeof resolveStoreTarget>, { type: "fide-jsonl" }> {
  if (target.type === "fide-jsonl") {
    throw new Error("This command only supports sqlite and postgres graphs. Use `fide statements write` for local `.fide` statements or build a sqlite/postgres graph first.");
  }

  if (target.type === "postgres" && !target.databaseUrl) {
    const localTarget = resolveGraphTarget(flags);
    const configuredConnection = target.databaseUrlEnv ?? null;
    throw createCliStructuredError(
      `Missing postgres connection for graph "${target.key ?? graphKey}". Configure graph.connection.url in its graph config or set the referenced env var.`,
      {
        hint: "For postgres graphs, graph.connection.url may be either a literal postgres URL or the name of an env var. The CLI could not resolve a database URL for this graph in the current process.",
        details: {
          graphKey,
          graphType: target.type,
          configuredConnection,
          connectionResolution: configuredConnection ? "env-var-name" : "missing",
          fideDir: `${localTarget.root}/.fide`,
          configPath: resolveGraphConfigPath(graphKey, localTarget.root),
          cwd: process.cwd(),
        },
        next: {
          checkStatus: `fide graph status --graph-key ${graphKey}`,
        },
      },
    );
  }

  return target;
}

export async function readProjectQueryOrThrow(flags: Map<string, string | boolean>): Promise<{ root: string; query: LocalQueryDefinition }> {
  const graphTarget = resolveGraphTarget(flags);
  if (graphTarget.type !== "local") {
    throw new Error("Project query commands only support project .fide directories.");
  }

  const graphKey = requireGraphKey(flags);
  const name = requireSavedQueryName(flags);
  const queries = await readLocalQueries(graphTarget.root);
  const query = queries.find((entry) => entry.graphKey === graphKey && entry.name === name);
  if (!query) {
    throw projectQueryMissingError(graphKey, name);
  }
  return { root: graphTarget.root, query };
}

export async function readProjectQueryByFileOrThrow(flags: Map<string, string | boolean>): Promise<{ root: string; query: LocalQueryDefinition }> {
  const graphTarget = resolveGraphTarget(flags);
  if (graphTarget.type !== "local") {
    throw new Error("Project query commands only support project .fide directories.");
  }

  const filePath = requireQueryFilePath(flags);
  const { graphKey, name } = resolveQueryFileSelector(graphTarget.root, filePath);
  const queries = await readLocalQueries(graphTarget.root);
  const query = queries.find((entry) => entry.graphKey === graphKey && entry.name === name);
  if (!query) {
    throw projectQueryMissingError(graphKey, name);
  }
  return { root: graphTarget.root, query };
}

export { assertGraphKey, getLocalFideWarnings, parseArgs, readLocalQueries, resolveGraphTarget, resolveQueriesDir, resolveStoreTarget, shouldUseJsonOutput };
