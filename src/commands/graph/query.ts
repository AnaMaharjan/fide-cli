import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { executeGraphQuery } from "@chris-test/graph-db";
import { getStringFlag, hasFlag, parseArgs, shouldUseJsonOutput } from "../../util/args.js";
import { renderCommandHelp } from "../../util/command-metadata.js";
import { printJson, readUtf8, writeUtf8 } from "../../util/io.js";
import { getLocalFideWarnings, LocalQueryDefinition, readLocalQueries, renderQueryFile, resolveGraphTarget, resolveQueriesDir, resolveStoreTarget } from "@chris-test/graph";
import {
  graphQueryCommand,
  graphQueryGetCommand,
  graphQueryListCommand,
  graphQueryRunCommand,
  graphQuerySaveCommand,
} from "./metadata.js";
import { readStdinUtf8 } from "./shared.js";
import { requireWorkspaceApiClient } from "../workspace/shared.js";
import { resolveWorkspaceSelectionOrThrow } from "../../util/workspace-settings.js";
import { okResponse } from "../../util/response.js";

function queryCommandHelp(): string {
  return [
    renderCommandHelp(graphQueryCommand),
    "",
    "Commands:",
    `  run        ${graphQueryRunCommand.summary}`,
    `  list       List project or hosted saved graph queries`,
    `  get        Read one project or hosted saved graph query`,
    `  save       Save a project or hosted graph query`,
    "",
    "Examples:",
    "  fide graph query run --graph primary 'select * from statements limit 10'",
    "  fide graph query run --profile work --graph primary --name recentStatements",
    "  fide graph query list --graph primary",
    "  fide graph query get --profile work --graph primary --name recentStatements",
    "  fide graph query save --graph primary --name recentStatements 'select * from statements limit 10'",
    "  fide graph query save --profile work --graph primary --name recentStatements 'select * from statements limit 10'",
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

function requireSavedQueryName(flags: Map<string, string | boolean>): string {
  const name = getStringFlag(flags, "name");
  if (!name) throw new Error("Missing required flag: --name <query-name>.");
  return name;
}

function requireGraphKey(flags: Map<string, string | boolean>): string {
  const graphKey = getStringFlag(flags, "graph");
  if (!graphKey) throw new Error("Missing required flag: --graph <name>.");
  return graphKey;
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
    throw new Error(`Project graph query not found: ${graphKey}/${name}`);
  }
  return { root: graphTarget.root, query };
}

async function runGraphQuerySaveProject(args: string[]): Promise<number> {
  const initialParsed = parseArgs(args);
  if (hasFlag(initialParsed.flags, "help") || hasFlag(initialParsed.flags, "-h")) {
    console.log(renderCommandHelp(graphQuerySaveCommand));
    return 0;
  }

  const { parsed, sql } = await resolveQuerySql(args);
  const flags = parsed.flags;
  const graphKey = requireGraphKey(flags);
  const name = requireSavedQueryName(flags);
  const description = getStringFlag(flags, "description");
  if (!sql.trim()) {
    console.error("Missing SQL for `graph query save`. Use `--stdin`, `--file <path>`, or pass SQL inline.");
    console.error(renderCommandHelp(graphQuerySaveCommand));
    return 1;
  }

  const graphTarget = resolveGraphTarget(flags);
  if (graphTarget.type !== "local") {
    throw new Error("`fide graph query save` without `--workspace` only supports project .fide directories.");
  }

  const outPath = resolve(resolveQueriesDir(graphTarget.root), graphKey, `${name}.sql`);
  await mkdir(resolve(outPath, ".."), { recursive: true });
  await writeUtf8(outPath, renderQueryFile(sql, {
    graphKey,
    description: description ?? null,
  }));

  const payload = {
    ok: true,
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

  const { parsed, sql } = await resolveQuerySql(args);
  const flags = parsed.flags;
  const useJson = shouldUseJsonOutput(flags);
  const graphKey = requireGraphKey(flags);
  const name = requireSavedQueryName(flags);
  const description = getStringFlag(flags, "description");
  const queryCatalog = getStringFlag(flags, "query-catalog");
  if (!sql.trim()) {
    console.error("Missing SQL for `graph query save --workspace`. Use `--stdin`, `--file <path>`, or pass SQL inline.");
    console.error(renderCommandHelp(graphQuerySaveCommand));
    return 1;
  }

  const selection = await resolveWorkspaceSelectionOrThrow(flags);
  const { auth, client } = await requireWorkspaceApiClient(flags);
  const result = await client.saveGraphQuery({
    workspaceId: selection.workspaceId,
    graphKey,
    name,
    sql,
    ...(typeof description === "string" ? { description } : {}),
    ...(queryCatalog ? { queryCatalog } : {}),
  });

  const payload = okResponse("graph-query-save-workspace.v1", {
    baseUrl: auth.baseUrl,
    source: auth.source,
    workspaceId: selection.workspaceId,
    workspaceSelectionSource: selection.source,
    queryCatalogKey: result.queryCatalogKey,
    query: result.query,
  }, {
    command: "fide graph query save",
    next: {
      get: `fide graph query get --workspace ${selection.workspaceId} --graph ${graphKey} --name ${name}${queryCatalog ? ` --query-catalog ${queryCatalog}` : ""}`,
      run: `fide graph query run --workspace ${selection.workspaceId} --graph ${graphKey} --name ${name}${queryCatalog ? ` --query-catalog ${queryCatalog}` : ""}`,
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
    throw new Error("`fide graph query list` without `--workspace` only supports project .fide directories.");
  }

  const graphKey = getStringFlag(flags, "graph");
  const queries = (await readLocalQueries(graphTarget.root))
    .filter((query) => !graphKey || query.graphKey === graphKey)
    .map(({ file, ...query }) => query);

  const payload = {
    root: graphTarget.root,
    queries,
  };
  if (useJson) {
    printJson(payload);
  } else {
    for (const query of queries) {
      console.log(`${query.graphKey} ${query.name}`);
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

  const graphKey = getStringFlag(flags, "graph");
  const queryCatalog = getStringFlag(flags, "query-catalog");
  const selection = await resolveWorkspaceSelectionOrThrow(flags);
  const { auth, client } = await requireWorkspaceApiClient(flags);
  const result = await client.listGraphQueries({
    workspaceId: selection.workspaceId,
    ...(queryCatalog ? { queryCatalog } : {}),
  });
  const queries = graphKey
    ? result.queries.filter((query) => query.graphKey === graphKey)
    : result.queries;

  const next: Record<string, string> = {};
  const first = queries[0];
  if (first) {
    next.get = `fide graph query get --workspace ${selection.workspaceId} --graph ${first.graphKey} --name ${first.name}${queryCatalog ? ` --query-catalog ${queryCatalog}` : ""}`;
  }

  const payload = okResponse("graph-query-list-workspace.v1", {
    baseUrl: auth.baseUrl,
    source: auth.source,
    workspaceId: selection.workspaceId,
    workspaceSelectionSource: selection.source,
    queryCatalogKey: result.queryCatalogKey,
    queries,
  }, {
    command: "fide graph query list",
    ...(Object.keys(next).length > 0 ? { next } : {}),
  });

  if (useJson) {
    printJson(payload);
  } else {
    for (const query of queries) {
      console.log(`${query.graphKey} ${query.name}`);
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
  const queryCatalog = getStringFlag(flags, "query-catalog");
  const selection = await resolveWorkspaceSelectionOrThrow(flags);
  const { auth, client } = await requireWorkspaceApiClient(flags);
  const query = await client.getGraphQuery({
    workspaceId: selection.workspaceId,
    graphKey,
    name,
    ...(queryCatalog ? { queryCatalog } : {}),
  });

  const payload = okResponse("graph-query-get-workspace.v1", {
    baseUrl: auth.baseUrl,
    source: auth.source,
    workspaceId: selection.workspaceId,
    workspaceSelectionSource: selection.source,
    query,
  }, {
    command: "fide graph query get",
    next: {
      list: `fide graph query list --workspace ${selection.workspaceId}${queryCatalog ? ` --query-catalog ${queryCatalog}` : ""}`,
      run: `fide graph query run --workspace ${selection.workspaceId} --graph ${graphKey} --name ${name}${queryCatalog ? ` --query-catalog ${queryCatalog}` : ""}`,
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
    if (target.type === "fide-jsonl") {
      throw new Error("This command only supports sqlite and postgres graphs. Use `fide graph statements write` for local `.fide` statements or build a sqlite/postgres graph first.");
    }
    const result = await executeGraphQuery({
      target,
      sql,
      allowWrite: hasFlag(resolvedFlags, "allow-write"),
    });
    if (shouldUseJsonOutput(resolvedFlags)) {
      const localTarget = resolveGraphTarget(resolvedFlags);
      printJson({
        ...result,
        ...("file" in result ? { warnings: getLocalFideWarnings(localTarget.root, { gitignore: localTarget.gitignore }) } : {}),
      });
    } else {
      console.log(JSON.stringify(result.rows, null, 2));
    }
    return 0;
  }

  const graphKey = requireGraphKey(flags);
  const queryCatalog = getStringFlag(flags, "query-catalog");
  const workspaceId = getStringFlag(flags, "workspace");
  const limitFlag = getStringFlag(flags, "limit");
  const limit = limitFlag ? Number(limitFlag) : undefined;
  if (limitFlag && (!Number.isInteger(limit) || Number(limit) <= 0)) {
    throw new Error("Invalid --limit value. Expected a positive integer.");
  }

  if (workspaceId) {
    const useJson = shouldUseJsonOutput(flags);
    const selection = await resolveWorkspaceSelectionOrThrow(flags);
    const { auth, client } = await requireWorkspaceApiClient(flags);
    const result = await client.runGraphQuery({
      workspaceId: selection.workspaceId,
      graphKey,
      name,
      ...(queryCatalog ? { queryCatalog } : {}),
      ...(typeof limit === "number" ? { limit } : {}),
    });
    const payload = okResponse("graph-query-run-workspace.v1", {
      baseUrl: auth.baseUrl,
      source: auth.source,
      workspaceId: selection.workspaceId,
      workspaceSelectionSource: selection.source,
      result,
    }, {
      command: "fide graph query run",
      next: {
        get: `fide graph query get --workspace ${selection.workspaceId} --graph ${graphKey} --name ${name}${queryCatalog ? ` --query-catalog ${queryCatalog}` : ""}`,
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
  if (target.type === "fide-jsonl") {
    throw new Error("This command only supports sqlite and postgres graphs. Use `fide graph statements write` for local `.fide` statements or build a sqlite/postgres graph first.");
  }
  const result = await executeGraphQuery({
    target,
    sql: query.sql,
    allowWrite: hasFlag(flags, "allow-write"),
  });
  if (shouldUseJsonOutput(flags)) {
    const localTarget = resolveGraphTarget(flags);
    printJson({
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
  if (getStringFlag(parsed.flags, "workspace")) {
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
  if (getStringFlag(parsed.flags, "workspace")) {
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
  if (getStringFlag(parsed.flags, "workspace")) {
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
