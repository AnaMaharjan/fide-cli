import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { executeGraphQuery } from "@chris-test/graph-db";
import { getStringFlag, hasFlag, parseArgs, shouldUseJsonOutput } from "../../util/args.js";
import { renderCommandHelp } from "../../util/command-metadata.js";
import { printJson, readUtf8, writeUtf8 } from "../../util/io.js";
import { getLocalFideWarnings, LocalQueryDefinition, readLocalQueries, renderQueryFile, resolveGraphTarget, resolveQueriesDir, resolveStoreTarget } from "@chris-test/graph";
import { resolveSettingsPath } from "../../util/fide-dir.js";
import {
  graphQueryCommand,
  graphQueryGetCommand,
  graphQueryListCommand,
  graphQueryRunCommand,
  graphQuerySaveCommand,
} from "./metadata.js";
import { readStdinUtf8 } from "./shared.js";
import { requireWorkspaceApiClient, runHostedOperation } from "../workspace/shared.js";
import { assertGraphKey, assertQueryName } from "../../util/selectors.js";
import { resolveWorkspaceSelection, resolveWorkspaceSelectionOrThrow } from "../../util/workspace-settings.js";
import { okResponse } from "../../util/response.js";

type GraphQueryScope =
  | { targetScope: "local" }
  | {
      targetScope: "workspace";
      workspaceId: string;
      workspaceSelectionSource: "flag" | "env";
    };

function queryCommandHelp(): string {
  return [
    renderCommandHelp(graphQueryCommand),
    "",
    "Commands:",
    `  run        ${graphQueryRunCommand.summary}`,
    `  list       List compact project or hosted saved graph query summaries`,
    `  get        Read one full project or hosted saved graph query`,
    `  save       Save a project or hosted graph query`,
    "",
    "Examples:",
    "  fide graph query list --graph primary",
    "  fide graph query list --workspace <workspace-id>",
    "  fide graph query get --workspace <workspace-id> --graph primary --name recentStatements",
    "  fide graph query get --graph primary --name recentStatements",
    "  fide graph query save --graph primary --name recentStatements 'select * from statements limit 10'",
    "  fide graph query save --workspace <workspace-id> --graph primary --name recentStatements 'select * from statements limit 10'",
    "  fide graph query run --graph primary 'select * from statements limit 10'",
    "  fide graph query run --graph primary --name recentStatements",
    "  fide graph query run --workspace <workspace-id> --graph primary --name recentStatements",
  ].join("\n");
}

async function resolveQuerySql(args: string[]): Promise<{ parsed: ReturnType<typeof parseArgs>; sql: string }> {
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

function parseQueryFileDescription(content: string): { description: string | null; sql: string } {
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

async function resolveQuerySaveInput(args: string[]): Promise<{
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

function requireSavedQueryName(flags: Map<string, string | boolean>): string {
  const name = getStringFlag(flags, "name");
  if (!name) throw new Error("Missing required flag: --name <query-name>.");
  return assertQueryName(name);
}

function requireGraphKey(flags: Map<string, string | boolean>): string {
  const graphKey = getStringFlag(flags, "graph");
  if (!graphKey) throw new Error("Missing required flag: --graph <name>.");
  return assertGraphKey(graphKey);
}

export async function resolveGraphQueryScope(flags: Map<string, string | boolean>): Promise<GraphQueryScope> {
  const selection = await resolveWorkspaceSelection(flags);
  if (!selection) {
    return { targetScope: "local" };
  }
  return {
    targetScope: "workspace",
    workspaceId: selection.workspaceId,
    workspaceSelectionSource: selection.source,
  };
}

function isWorkspaceScope(scope: GraphQueryScope): scope is Extract<GraphQueryScope, { targetScope: "workspace" }> {
  return scope.targetScope === "workspace";
}

function projectQueryMissingError(graphKey: string, name: string): Error {
  return new Error(`Local project query not found: ${graphKey}/${name}. Use \`fide graph query list\` to inspect local queries, or pass \`--workspace <workspace-id>\` / set \`FIDE_WORKSPACE_ID\` for hosted queries.`);
}

function createCliStructuredError(
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

function assertLocalQueryableStore(
  graphKey: string,
  target: ReturnType<typeof resolveStoreTarget>,
  flags: Map<string, string | boolean>,
) {
  if (target.type === "fide-jsonl") {
    throw new Error("This command only supports sqlite and postgres graphs. Use `fide graph statements write` for local `.fide` statements or build a sqlite/postgres graph first.");
  }

  if (target.type === "postgres" && !target.databaseUrl) {
    const localTarget = resolveGraphTarget(flags);
    throw createCliStructuredError(
      `Missing postgres connection for store "${target.key ?? graphKey}". Configure the store in settings.json or set the referenced env var.`,
      {
        hint: "This graph uses a postgres runtime target, but the CLI could not resolve a database URL for the current process.",
        details: {
          graphKey,
          graphStoreType: target.type,
          connectionEnv: target.databaseUrlEnv,
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
}

async function readProjectQueryOrThrow(flags: Map<string, string | boolean>): Promise<{ root: string; query: LocalQueryDefinition }> {
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

async function runGraphQuerySaveProject(args: string[]): Promise<number> {
  const initialParsed = parseArgs(args);
  if (hasFlag(initialParsed.flags, "help") || hasFlag(initialParsed.flags, "-h")) {
    console.log(renderCommandHelp(graphQuerySaveCommand));
    return 0;
  }

  const { parsed, sql, fileDescription } = await resolveQuerySaveInput(args);
  const flags = parsed.flags;
  const graphKey = requireGraphKey(flags);
  const name = requireSavedQueryName(flags);
  const description = getStringFlag(flags, "description") ?? fileDescription;
  if (!sql.trim()) {
    console.error("Missing SQL for `graph query save`. Use `--stdin`, `--file <path>`, or pass SQL inline.");
    console.error(renderCommandHelp(graphQuerySaveCommand));
    return 1;
  }

  const graphTarget = resolveGraphTarget(flags);
  if (graphTarget.type !== "local") {
    throw new Error("`fide graph query save` is in local mode here and only supports project `.fide` directories. Pass `--workspace <workspace-id>` or set `FIDE_WORKSPACE_ID` to save a hosted query.");
  }

  const outPath = resolve(resolveQueriesDir(graphTarget.root), graphKey, `${name}.sql`);
  await mkdir(resolve(outPath, ".."), { recursive: true });
  await writeUtf8(outPath, renderQueryFile(sql, {
    graphKey,
    description: description ?? null,
  }));

  const payload = {
    ok: true,
    targetScope: "local",
    mode: "query",
    graphKey,
    name,
    outPath,
    warnings: getLocalFideWarnings(graphTarget.root, { gitignore: graphTarget.gitignore }),
  };
  if (shouldUseJsonOutput(flags)) {
    printJson(payload);
  } else {
    console.log(outPath);
  }
  return 0;
}

async function runGraphQuerySaveWorkspace(args: string[]): Promise<number> {
  const initialParsed = parseArgs(args);
  if (hasFlag(initialParsed.flags, "help") || hasFlag(initialParsed.flags, "-h")) {
    console.log(renderCommandHelp(graphQuerySaveCommand));
    return 0;
  }

  const { parsed, sql, fileDescription } = await resolveQuerySaveInput(args);
  const flags = parsed.flags;
  const useJson = shouldUseJsonOutput(flags);
  const dryRun = hasFlag(flags, "dry-run");
  const graphKey = requireGraphKey(flags);
  const name = requireSavedQueryName(flags);
  const description = getStringFlag(flags, "description") ?? fileDescription;
  if (!sql.trim()) {
    console.error("Missing SQL for `graph query save --workspace`. Use `--stdin`, `--file <path>`, or pass SQL inline.");
    console.error(renderCommandHelp(graphQuerySaveCommand));
    return 1;
  }

  const selection = await resolveWorkspaceSelectionOrThrow(flags);
  const { auth, client } = await requireWorkspaceApiClient(flags);
  if (dryRun) {
    let wouldChange = true;
    let preview: {
      targetState: "new-query" | "existing-query";
      changeState: "would_change" | "unchanged";
      reason: "query_missing" | "query_would_update" | "query_unchanged";
    } = {
      targetState: "new-query",
      changeState: "would_change",
      reason: "query_missing",
    };
    try {
      const existing = await client.getGraphQuery({
        workspaceId: selection.workspaceId,
        graphKey,
        name,
      });
      const currentQuery = {
        graphKey: existing.graphKey,
        name: existing.name,
        description: existing.description ?? null,
        sql: existing.sql,
      };
      const nextQuery = {
        graphKey,
        name,
        description: description ?? null,
        sql,
      };
      wouldChange = !isDeepStrictEqual(currentQuery, nextQuery);
      preview = wouldChange
        ? {
          targetState: "existing-query",
          changeState: "would_change",
          reason: "query_would_update",
        }
        : {
          targetState: "existing-query",
          changeState: "unchanged",
          reason: "query_unchanged",
        };
    } catch (error) {
      const status = typeof error === "object" && error && "status" in error ? (error as { status?: unknown }).status : null;
      if (status !== 404) {
        throw await runHostedOperation(async () => {
          throw error;
        }, {
          auth,
          client,
          targetScope: "workspace",
          workspaceId: selection.workspaceId,
          workspaceSelectionSource: selection.source,
          graphKey,
          queryName: name,
        });
      }
    }

    const payload = okResponse("graph-query-save-workspace.v1", {
      targetScope: "workspace",
      dryRun: true,
      wouldChange,
      preview,
      baseUrl: auth.baseUrl,
      source: auth.source,
      workspaceId: selection.workspaceId,
      workspaceSelectionSource: selection.source,
      query: {
        graphKey,
        name,
        description: description ?? null,
        sql,
      },
    }, {
      command: "fide graph query save",
      next: {
        get: `fide graph query get --workspace ${selection.workspaceId} --graph ${graphKey} --name ${name}`,
      },
    });

    if (useJson) {
      printJson(payload);
    } else {
      console.log(`Dry run: ${graphKey}/${name} ${preview.reason}`);
    }
    return 0;
  }

  const result = await runHostedOperation(
    () => client.saveGraphQuery({
      workspaceId: selection.workspaceId,
      graphKey,
      name,
      sql,
      ...(typeof description === "string" ? { description } : {}),
    }),
    {
      auth,
      client,
      targetScope: "workspace",
      workspaceId: selection.workspaceId,
      workspaceSelectionSource: selection.source,
      graphKey,
      queryName: name,
    },
  );

  const payload = okResponse("graph-query-save-workspace.v1", {
    targetScope: "workspace",
    baseUrl: auth.baseUrl,
    source: auth.source,
    workspaceId: selection.workspaceId,
    workspaceSelectionSource: selection.source,
    query: result.query,
  }, {
    command: "fide graph query save",
    next: {
      get: `fide graph query get --workspace ${selection.workspaceId} --graph ${graphKey} --name ${name}`,
      run: `fide graph query run --workspace ${selection.workspaceId} --graph ${graphKey} --name ${name}`,
    },
  });

  if (useJson) {
    printJson(payload);
  } else {
    console.log(`${result.query.graphKey} ${result.query.name}`);
  }
  return 0;
}

async function runGraphQueryListProject(args: string[]): Promise<number> {
  const { flags } = parseArgs(args);
  const useJson = shouldUseJsonOutput(flags);
  if (hasFlag(flags, "help") || hasFlag(flags, "-h")) {
    console.log(renderCommandHelp(graphQueryListCommand));
    return 0;
  }

  const graphTarget = resolveGraphTarget(flags);
  if (graphTarget.type !== "local") {
    throw new Error("`fide graph query list` is in local mode here and only supports project `.fide` directories. Pass `--workspace <workspace-id>` or set `FIDE_WORKSPACE_ID` to list hosted queries.");
  }

  const graphKeyRaw = getStringFlag(flags, "graph");
  const graphKey = graphKeyRaw ? assertGraphKey(graphKeyRaw) : null;
  const queries = (await readLocalQueries(graphTarget.root))
    .filter((query) => !graphKey || query.graphKey === graphKey)
    .map(({ file, graphKey: currentGraphKey, name, description }) => ({ graphKey: currentGraphKey, name, description }));

  const payload = {
    targetScope: "local",
    root: graphTarget.root,
    queries,
  };
  if (useJson) {
    printJson(payload);
  } else {
    for (const query of queries) {
      const description = query.description ? ` - ${query.description}` : "";
      console.log(`${query.graphKey} ${query.name}${description}`);
    }
  }
  return 0;
}

async function runGraphQueryListWorkspace(args: string[]): Promise<number> {
  const { flags } = parseArgs(args);
  const useJson = shouldUseJsonOutput(flags);
  if (hasFlag(flags, "help") || hasFlag(flags, "-h")) {
    console.log(renderCommandHelp(graphQueryListCommand));
    return 0;
  }

  const graphKeyRaw = getStringFlag(flags, "graph");
  const graphKey = graphKeyRaw ? assertGraphKey(graphKeyRaw) : null;
  const selection = await resolveWorkspaceSelectionOrThrow(flags);
  const { auth, client } = await requireWorkspaceApiClient(flags);
  const result = await runHostedOperation(
    () => client.listGraphQueries({ workspaceId: selection.workspaceId }),
    {
      auth,
      client,
      targetScope: "workspace",
      workspaceId: selection.workspaceId,
      workspaceSelectionSource: selection.source,
      graphKey: graphKey ?? undefined,
    },
  );
  const queries = graphKey
    ? result.queries.filter((query) => query.graphKey === graphKey)
    : result.queries;

  const next: Record<string, string> = {};
  const first = queries[0];
  if (first) {
    next.get = `fide graph query get --workspace ${selection.workspaceId} --graph ${first.graphKey} --name ${first.name}`;
  }

  const payload = okResponse("graph-query-list-workspace.v1", {
    targetScope: "workspace",
    baseUrl: auth.baseUrl,
    source: auth.source,
    workspaceId: selection.workspaceId,
    workspaceSelectionSource: selection.source,
    queries,
  }, {
    command: "fide graph query list",
    ...(Object.keys(next).length > 0 ? { next } : {}),
  });

  if (useJson) {
    printJson(payload);
  } else {
    for (const query of queries) {
      const description = query.description ? ` - ${query.description}` : "";
      console.log(`${query.graphKey} ${query.name}${description}`);
    }
  }
  return 0;
}

async function runGraphQueryGetProject(args: string[]): Promise<number> {
  const { flags } = parseArgs(args);
  const useJson = shouldUseJsonOutput(flags);
  if (hasFlag(flags, "help") || hasFlag(flags, "-h")) {
    console.log(renderCommandHelp(graphQueryGetCommand));
    return 0;
  }

  const { root, query } = await readProjectQueryOrThrow(flags);
  const payload = {
    targetScope: "local",
    root,
    query: {
      graphKey: query.graphKey,
      name: query.name,
      description: query.description,
      sql: query.sql,
    },
  };
  if (useJson) {
    printJson(payload);
  } else {
    console.log(query.sql);
  }
  return 0;
}

async function runGraphQueryGetWorkspace(args: string[]): Promise<number> {
  const { flags } = parseArgs(args);
  const useJson = shouldUseJsonOutput(flags);
  if (hasFlag(flags, "help") || hasFlag(flags, "-h")) {
    console.log(renderCommandHelp(graphQueryGetCommand));
    return 0;
  }

  const graphKey = requireGraphKey(flags);
  const name = requireSavedQueryName(flags);
  const selection = await resolveWorkspaceSelectionOrThrow(flags);
  const { auth, client } = await requireWorkspaceApiClient(flags);
  const query = await runHostedOperation(
    () => client.getGraphQuery({
      workspaceId: selection.workspaceId,
      graphKey,
      name,
    }),
    {
      auth,
      client,
      targetScope: "workspace",
      workspaceId: selection.workspaceId,
      workspaceSelectionSource: selection.source,
      graphKey,
      queryName: name,
    },
  );

  const payload = okResponse("graph-query-get-workspace.v1", {
    targetScope: "workspace",
    baseUrl: auth.baseUrl,
    source: auth.source,
    workspaceId: selection.workspaceId,
    workspaceSelectionSource: selection.source,
    query,
  }, {
    command: "fide graph query get",
    next: {
      list: `fide graph query list --workspace ${selection.workspaceId}`,
      run: `fide graph query run --workspace ${selection.workspaceId} --graph ${graphKey} --name ${name}`,
    },
  });

  if (useJson) {
    printJson(payload);
  } else {
    console.log(query.sql);
  }
  return 0;
}

async function runGraphQueryRun(args: string[]): Promise<number> {
  const initialParsed = parseArgs(args);
  if (hasFlag(initialParsed.flags, "help") || hasFlag(initialParsed.flags, "-h")) {
    console.log(renderCommandHelp(graphQueryRunCommand));
    return 0;
  }

  const flags = initialParsed.flags;
  const name = getStringFlag(flags, "name");
  if (!name) {
    const { parsed, sql } = await resolveQuerySql(args);
    const resolvedFlags = parsed.flags;
    const graphKey = requireGraphKey(resolvedFlags);
    if (!sql.trim()) {
      console.error("Missing query text for `graph query run`. Use `--stdin`, `--file <path>`, or pass the query inline.");
      console.error(renderCommandHelp(graphQueryRunCommand));
      return 1;
    }
    const target = resolveStoreTarget(new Map<string, string | boolean>([["graph", graphKey]]));
    assertLocalQueryableStore(graphKey, target, resolvedFlags);
    const result = await executeGraphQuery({
      target,
      sql,
      allowWrite: hasFlag(resolvedFlags, "allow-write"),
    });
    if (shouldUseJsonOutput(resolvedFlags)) {
      const localTarget = resolveGraphTarget(resolvedFlags);
      printJson({
        targetScope: "local",
        ...result,
        ...("file" in result ? { warnings: getLocalFideWarnings(localTarget.root, { gitignore: localTarget.gitignore }) } : {}),
      });
    } else {
      console.log(JSON.stringify(result.rows, null, 2));
    }
    return 0;
  }

  const graphKey = requireGraphKey(flags);
  const limitFlag = getStringFlag(flags, "limit");
  const limit = limitFlag ? Number(limitFlag) : undefined;
  if (limitFlag && (!Number.isInteger(limit) || Number(limit) <= 0)) {
    throw new Error("Invalid --limit value. Expected a positive integer.");
  }

  const queryScope = await resolveGraphQueryScope(flags);
  if (isWorkspaceScope(queryScope)) {
    const useJson = shouldUseJsonOutput(flags);
    const selection = await resolveWorkspaceSelectionOrThrow(flags);
    const { auth, client } = await requireWorkspaceApiClient(flags);
    const result = await runHostedOperation(
      () => client.runGraphQuery({
        workspaceId: selection.workspaceId,
        graphKey,
        name,
        ...(typeof limit === "number" ? { limit } : {}),
      }),
      {
        auth,
        client,
        targetScope: "workspace",
        workspaceId: selection.workspaceId,
        workspaceSelectionSource: selection.source,
        graphKey,
        queryName: name,
      },
    );
    const payload = okResponse("graph-query-run-workspace.v1", {
      targetScope: "workspace",
      baseUrl: auth.baseUrl,
      source: auth.source,
      workspaceId: selection.workspaceId,
      workspaceSelectionSource: selection.source,
      result,
    }, {
      command: "fide graph query run",
      next: {
        get: `fide graph query get --workspace ${selection.workspaceId} --graph ${graphKey} --name ${name}`,
      },
    });

    if (useJson) {
      printJson(payload);
    } else {
      console.log(JSON.stringify(result.rows, null, 2));
    }
    return 0;
  }

  const { query } = await readProjectQueryOrThrow(flags);
  const target = resolveStoreTarget(new Map<string, string | boolean>([["graph", graphKey]]));
  assertLocalQueryableStore(graphKey, target, flags);
  const result = await executeGraphQuery({
    target,
    sql: query.sql,
    allowWrite: hasFlag(flags, "allow-write"),
  });
  if (shouldUseJsonOutput(flags)) {
    const localTarget = resolveGraphTarget(flags);
    printJson({
      targetScope: "local",
      ...result,
      ...("file" in result ? { warnings: getLocalFideWarnings(localTarget.root, { gitignore: localTarget.gitignore }) } : {}),
    });
  } else {
    console.log(JSON.stringify(result.rows, null, 2));
  }
  return 0;
}

async function runGraphQueryListCommand(args: string[]): Promise<number> {
  const parsed = parseArgs(args);
  if (hasFlag(parsed.flags, "help") || hasFlag(parsed.flags, "-h")) {
    console.log(renderCommandHelp(graphQueryListCommand));
    return 0;
  }
  const queryScope = await resolveGraphQueryScope(parsed.flags);
  if (isWorkspaceScope(queryScope)) {
    return runGraphQueryListWorkspace(args);
  }
  return runGraphQueryListProject(args);
}

async function runGraphQueryGetCommand(args: string[]): Promise<number> {
  const parsed = parseArgs(args);
  if (hasFlag(parsed.flags, "help") || hasFlag(parsed.flags, "-h")) {
    console.log(renderCommandHelp(graphQueryGetCommand));
    return 0;
  }
  const queryScope = await resolveGraphQueryScope(parsed.flags);
  if (isWorkspaceScope(queryScope)) {
    return runGraphQueryGetWorkspace(args);
  }
  return runGraphQueryGetProject(args);
}

async function runGraphQuerySaveCommand(args: string[]): Promise<number> {
  const parsed = parseArgs(args);
  if (hasFlag(parsed.flags, "help") || hasFlag(parsed.flags, "-h")) {
    console.log(renderCommandHelp(graphQuerySaveCommand));
    return 0;
  }
  const queryScope = await resolveGraphQueryScope(parsed.flags);
  if (isWorkspaceScope(queryScope)) {
    return runGraphQuerySaveWorkspace(args);
  }
  return runGraphQuerySaveProject(args);
}

export async function runGraphQueryCommand(args: string[]): Promise<number> {
  const [command, ...rest] = args;

  if (!command || command === "--help" || command === "-h" || command === "help") {
    console.log(queryCommandHelp());
    return 0;
  }

  if (command === "run") {
    return runGraphQueryRun(rest);
  }
  if (command === "list") {
    return runGraphQueryListCommand(rest);
  }
  if (command === "get") {
    return runGraphQueryGetCommand(rest);
  }
  if (command === "save") {
    return runGraphQuerySaveCommand(rest);
  }

  throw new Error(`Unknown graph query command: ${command}`);
}
