import { readStdinUtf8 } from "../graph/shared.js";
import { getStringFlag, hasFlag, parseArgs, shouldUseJsonOutput } from "../../util/command/args.js";
import { readUtf8 } from "../../util/command/io.js";
import {
  getLocalFideWarnings,
  type LocalQueryDefinition,
  readLocalQueries,
  resolveGraphTarget,
  resolveQueriesDir,
  resolveStoreTarget,
} from "@chris-test/graph";
import { resolveSettingsPath } from "../../util/project/fide-dir.js";
import { assertGraphKey, assertQueryName } from "../../util/ids/selectors.js";
import {
  resolveWorkspaceSelection,
  type WorkspaceSelectionSource,
} from "../../util/workspace/workspace-settings.js";

export type GraphQueryScope =
  | { targetScope: "local" }
  | {
      targetScope: "workspace";
      workspaceId: string;
      workspaceSelectionSource: WorkspaceSelectionSource;
    };

export async function resolveQuerySql(args: string[]): Promise<{ parsed: ReturnType<typeof parseArgs>; sql: string }> {
  const parsed = parseArgs(args);
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
  const parsed = parseArgs(args);
  const flags = parsed.flags;
  const filePath = getStringFlag(flags, "file");

  if (filePath) {
    const content = await readUtf8(filePath);
    const parsedFile = parseQueryFileDescription(content);
    return {
      parsed,
      sql: parsedFile.sql,
      fileDescription: parsedFile.description,
    };
  }

  const resolved = await resolveQuerySql(args);
  return {
    parsed: resolved.parsed,
    sql: resolved.sql,
    fileDescription: null,
  };
}

export function requireSavedQueryName(flags: Map<string, string | boolean>): string {
  const name = getStringFlag(flags, "name");
  if (!name) throw new Error("Missing required flag: --name <query-name>.");
  return assertQueryName(name);
}

export function requireGraphKey(flags: Map<string, string | boolean>): string {
  const graphKey = getStringFlag(flags, "graph");
  if (!graphKey) throw new Error("Missing required flag: --graph <key>.");
  return assertGraphKey(graphKey);
}

export function resolveDescriptionUpdate(
  flags: Map<string, string | boolean>,
  fileDescription: string | null,
): { mode: "preserve" } | { mode: "set"; value: string | null } {
  const descriptionFlag = getStringFlag(flags, "description");
  if (typeof descriptionFlag === "string") {
    return {
      mode: "set",
      value: descriptionFlag,
    };
  }
  if (hasFlag(flags, "description")) {
    return {
      mode: "set",
      value: null,
    };
  }
  if (fileDescription !== null) {
    return {
      mode: "set",
      value: fileDescription,
    };
  }
  return { mode: "preserve" };
}

export function assertLocalQueryCommand(flags: Map<string, string | boolean>, command: string): void {
  if (!flags.has("workspace")) {
    return;
  }
  throw new Error(
    `\`${command}\` is local-only. Query definitions are authored in the project and synced by \`fide start\`; hosted query reads and writes are not part of this command surface.`,
  );
}

export async function resolveGraphQueryScope(flags: Map<string, string | boolean>): Promise<GraphQueryScope> {
  if (!flags.has("workspace")) {
    return { targetScope: "local" };
  }
  const selection = await resolveWorkspaceSelection(flags);
  if (!selection) {
    throw new Error("Hosted graph query mode requires a workspace id. Pass --workspace <workspace_id>, or pass --workspace and set FIDE_WORKSPACE_ID.");
  }
  return {
    targetScope: "workspace",
    workspaceId: selection.workspaceId,
    workspaceSelectionSource: selection.source,
  };
}

export function isWorkspaceScope(scope: GraphQueryScope): scope is Extract<GraphQueryScope, { targetScope: "workspace" }> {
  return scope.targetScope === "workspace";
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
      `Missing postgres connection for graph "${target.key ?? graphKey}". Configure graph.connection.url in settings.json or set the referenced env var.`,
      {
        hint: "For postgres graphs, graph.connection.url may be either a literal postgres URL or the name of an env var. The CLI could not resolve a database URL for this graph in the current process.",
        details: {
          graphKey,
          graphType: target.type,
          configuredConnection,
          connectionResolution: configuredConnection ? "env-var-name" : "missing",
          fideDir: `${localTarget.root}/.fide`,
          settingsPath: resolveSettingsPath(localTarget.root),
          cwd: process.cwd(),
        },
        next: {
          checkStatus: `fide graph status --graph ${graphKey}`,
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

export { assertGraphKey, getLocalFideWarnings, parseArgs, readLocalQueries, resolveGraphTarget, resolveQueriesDir, resolveStoreTarget, shouldUseJsonOutput };
