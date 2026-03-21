import { writeFile } from "node:fs/promises";
import {
  appendResolvedStatementsToPostgres,
  clearPostgresGraph,
  ensurePostgresGraphSchema,
  queryPostgresResolvedStatements,
  replaceQueryStoreQueries,
  appendSqliteGraphFromResolvedStatements,
  ensureSqliteGraphSchema,
  querySqliteResolvedStatements,
  type ResolvedStatementRow,
} from "@chris-test/graph-db";
import {
  getLocalFideWarnings,
  queryFideJsonlResolvedStatements,
  readJsonFile,
  readLocalQueries,
  resolveGraphTarget,
  resolveQueryStore,
  resolveSettingsPath,
  resolveStoreTarget,
  type FideSettings,
  type GraphRecipeStep,
  type ResolvedStatementStore,
  validateGraphSettings,
} from "@chris-test/graph";
import { getStringFlag, hasFlag, parseArgs, shouldUseJsonOutput } from "../../util/args.js";
import { renderCommandHelp } from "../../util/command-metadata.js";
import { printJson } from "../../util/io.js";
import { graphBuildCommand } from "./metadata.js";

function printBuildProgress(flags: Map<string, string | boolean>, message: string): void {
  if (shouldUseJsonOutput(flags)) return;
  console.log(message);
}

function buildHelp(): string {
  return renderCommandHelp(graphBuildCommand);
}

function escapeSqlString(value: string): string {
  return value.replaceAll("'", "''");
}

function renderRecipeSql(sql: string, lastRunAt: string | null): string {
  const resolvedLastRunAt = lastRunAt ?? "1970-01-01T00:00:00.000Z";
  return sql.replaceAll("$lastRunAt", `'${escapeSqlString(resolvedLastRunAt)}'`);
}

function describeStatementStore(target: ResolvedStatementStore) {
  if (target.type === "postgres") {
    return {
      storeType: "postgres",
      key: target.key,
      schema: target.schema,
      databaseUrlConfigured: Boolean(target.databaseUrl),
      databaseUrlSource: target.databaseUrlSource,
      databaseUrlEnv: target.databaseUrlEnv,
    };
  }
  if (target.type === "sqlite") {
    return {
      storeType: "sqlite",
      key: target.key,
      file: target.file,
      warnings: getLocalFideWarnings(process.cwd(), { gitignore: target.gitignore }),
    };
  }
  return {
    storeType: "fide-jsonl",
    key: target.key,
    dir: target.dir,
  };
}

function describeRecipeStep(step: GraphRecipeStep, source: ResolvedStatementStore, lastRunAt: string | null) {
  const sql = typeof step.sql === "string" ? renderRecipeSql(step.sql, lastRunAt) : null;
  return {
    from: step.from,
    source: describeStatementStore(source),
    usesSql: Boolean(sql),
    sql,
    fromDateUTC: step.fromDateUTC ?? null,
    toDateUTC: step.toDateUTC ?? null,
  };
}

function printBuildPayload(flags: Map<string, string | boolean>, payload: Record<string, unknown>): void {
  if (shouldUseJsonOutput(flags)) {
    printJson(payload);
  } else {
    console.log(JSON.stringify(payload, null, 2));
  }
}

function sameGraphLocation(a: ResolvedStatementStore, b: ResolvedStatementStore): boolean {
  if (a.type !== b.type) return false;
  if (a.type === "sqlite" && b.type === "sqlite") return a.file === b.file;
  if (a.type === "postgres" && b.type === "postgres") return a.databaseUrl === b.databaseUrl && a.schema === b.schema;
  if (a.type === "fide-jsonl" && b.type === "fide-jsonl") return a.dir === b.dir;
  return false;
}

function assertRecipeTarget(target: ResolvedStatementStore): asserts target is Extract<ResolvedStatementStore, { type: "postgres" | "sqlite" }> {
  if (!target.recipe || target.recipe.length === 0) {
    throw new Error(`Store "${target.key ?? "unknown"}" has no recipe.`);
  }
}

function previewStatementBuild(target: Extract<ResolvedStatementStore, { type: "postgres" | "sqlite" }>) {
  const recipe = target.recipe ?? [];
  const previousLastRunAt = target.runState?.metadata?.lastRunAt ?? null;
  const steps = recipe.map((step) => {
    const source = resolveStoreTarget(new Map<string, string | boolean>([["graph", step.from]]));
    if (sameGraphLocation(target, source)) {
      throw new Error(`Store "${target.key ?? "unknown"}" recipe step source "${step.from}" points at the same physical store as the destination store.`);
    }
    return describeRecipeStep(step, source, previousLastRunAt);
  });

  return {
    ok: true,
    mode: "dry-run",
    target: describeStatementStore(target),
    lastRunAt: previousLastRunAt,
    stepCount: steps.length,
    steps,
  };
}

function previewQueryStoreBuild(queryStore: ReturnType<typeof resolveQueryStore>, queries: Awaited<ReturnType<typeof readLocalQueries>>) {
  return {
    ok: true,
    mode: "dry-run",
    target: {
      storeType: "postgres",
      key: queryStore.key,
      schema: queryStore.schema,
      databaseUrlConfigured: Boolean(queryStore.databaseUrl),
      databaseUrlSource: queryStore.databaseUrlSource,
      databaseUrlEnv: queryStore.databaseUrlEnv,
    },
    queryCount: queries.length,
    queries: queries.map((query) => ({
      name: query.name,
      graphKey: query.graphKey,
      description: query.description,
      file: query.file,
    })),
  };
}

async function writeStoreRunState(key: string, lastRunAt: string, lastRunStatementsAdded: number): Promise<void> {
  const settingsPath = resolveSettingsPath(process.cwd());
  const current = readJsonFile<FideSettings>(settingsPath) ?? {};
  current.graphs = current.graphs ?? {};
  const store = current.graphs[key];
  if (!store) {
    throw new Error(`Unknown store in settings.json: ${key}`);
  }
  current.graphs[key] = {
    ...store,
    metadata: {
      lastRunAt,
      lastRunStatementsAdded,
    },
  };
  validateGraphSettings(current);
  await writeFile(settingsPath, `${JSON.stringify(current, null, 2)}\n`, "utf8");
}

async function queryRecipeStep(step: GraphRecipeStep, lastRunAt: string | null): Promise<{ source: ResolvedStatementStore; rows: ResolvedStatementRow[] }> {
  const source = resolveStoreTarget(new Map<string, string | boolean>([["graph", step.from]]));
  const sql = typeof step.sql === "string" ? renderRecipeSql(step.sql, lastRunAt) : null;

  if (source.type === "fide-jsonl") {
    if (sql) throw new Error(`Recipe source "${step.from}" is a fide-jsonl store and cannot run SQL. Remove the sql field from that recipe step.`);
    return {
      source,
      rows: await queryFideJsonlResolvedStatements(source.dir, {
        fromDateUTC: step.fromDateUTC,
        toDateUTC: step.toDateUTC,
        lastRunAt,
      }),
    };
  }

  if (!sql) throw new Error(`Recipe source "${step.from}" requires sql.`);
  if (source.type === "postgres") {
    if (!source.databaseUrl) throw new Error(`Missing postgres connection for recipe source "${step.from}".`);
    await ensurePostgresGraphSchema(source.databaseUrl, source.schema);
    return { source, rows: await queryPostgresResolvedStatements(source.databaseUrl, source.schema, sql) };
  }

  await ensureSqliteGraphSchema(source.file, { drop: false });
  return { source, rows: await querySqliteResolvedStatements(source.file, sql) };
}

export async function runGraphBuild(args: string[] = []): Promise<number> {
  const parsed = parseArgs(args);
  const flags = parsed.flags;
  if (hasFlag(flags, "help") || hasFlag(flags, "-h")) {
    console.log(buildHelp());
    return 0;
  }

  const dryRun = hasFlag(flags, "dry-run");
  const queryStoreKey = getStringFlag(flags, "query-store");
  if (queryStoreKey) {
    const queryStore = resolveQueryStore(new Map<string, string | boolean>([["query-store", queryStoreKey]]));
    const graphTarget = resolveGraphTarget(flags);
    const queries = await readLocalQueries(graphTarget.root);
    if (dryRun) {
      printBuildPayload(flags, previewQueryStoreBuild(queryStore, queries));
      return 0;
    }
    const queryCount = await replaceQueryStoreQueries(queryStore, queries);
    printBuildPayload(flags, {
      ok: true,
      storeType: "postgres",
      key: queryStore.key,
      schema: queryStore.schema,
      queryCount,
    });
    return 0;
  }

  const graphKey = getStringFlag(flags, "graph");
  if (!graphKey) throw new Error("Missing required flag: --graph <name> or --query-store <name>.");

  const target = resolveStoreTarget(new Map<string, string | boolean>([["graph", graphKey]]));
  assertRecipeTarget(target);
  const previousLastRunAt = target.runState?.metadata?.lastRunAt ?? null;
  if (dryRun) {
    printBuildPayload(flags, previewStatementBuild(target));
    return 0;
  }

  printBuildProgress(flags, `Building statement store ${JSON.stringify(target.key ?? "unknown")}...`);

  for (const step of target.recipe ?? []) {
    const source = resolveStoreTarget(new Map<string, string | boolean>([["graph", step.from]]));
    if (sameGraphLocation(target, source)) {
      throw new Error(`Store "${target.key ?? "unknown"}" recipe step source "${step.from}" points at the same physical store as the destination store.`);
    }
  }

  if (target.type === "postgres") {
    if (!target.databaseUrl) throw new Error(`Missing postgres connection for store "${target.key ?? "unknown"}".`);
    printBuildProgress(flags, `Preparing postgres schema ${JSON.stringify(target.schema)}...`);
    await ensurePostgresGraphSchema(target.databaseUrl, target.schema);
    printBuildProgress(flags, "Clearing existing destination statements...");
    await clearPostgresGraph(target.databaseUrl, target.schema);
  } else {
    printBuildProgress(flags, `Preparing sqlite file ${JSON.stringify(target.file)}...`);
    await ensureSqliteGraphSchema(target.file, { drop: true });
  }

  let totalStatements = 0;
  for (const step of target.recipe ?? []) {
    printBuildProgress(flags, `Resolving recipe step from ${JSON.stringify(step.from)}...`);
    const { rows } = await queryRecipeStep(step, previousLastRunAt);
    totalStatements += rows.length;
    if (target.type === "postgres") {
      if (!target.databaseUrl) throw new Error(`Missing postgres connection for store "${target.key ?? "unknown"}".`);
      await appendResolvedStatementsToPostgres(target.databaseUrl, target.schema, rows);
    } else {
      await appendSqliteGraphFromResolvedStatements(target.file, rows);
    }
  }

  if (target.key) {
    await writeStoreRunState(target.key, new Date().toISOString(), totalStatements);
  }

  printBuildPayload(flags, {
    ok: true,
    storeType: target.type,
    key: target.key,
    statementsAdded: totalStatements,
    warnings: target.type === "sqlite" ? getLocalFideWarnings(process.cwd(), { gitignore: target.gitignore }) : undefined,
  });
  return 0;
}
