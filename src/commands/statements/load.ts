// fide statements load --graph-key primary_sb_test
// fide statements load --graph-key sqlite-test



import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseGraphStatementBatchJsonl } from "@chris-test/graph";
import { hasFlag, parseArgs, shouldUseJsonOutput } from "../../util/command/args.js";
import {
  booleanKeysFromCommand,
  defineCommand,
  mergeBooleanKeySets,
  renderCommandHelp,
} from "../../util/command/command-metadata.js";
import { printJson } from "../../util/command/io.js";
import { formatPretty } from "../../util/command/pretty.js";
import { assertGraphKey } from "../../util/ids/selectors.js";
import { listStatementBatchCandidates } from "../../lib/graph/etl/extract/listStatementBatches.js";
import {
  clearSourceDraftRootPendingReplacementInMetaFile,
  collectSupersededRootsFromStatementsDayMeta,
  listStatementsDayMetaPaths,
} from "../../lib/graph/etl/extract/statementsDayMeta.js";
import {
  deleteStatementBatchByRootFromPostgres,
  loadStatementBatchToPostgres,
} from "../../lib/graph/etl/load/adapters/postgres.js";
import {
  deleteStatementBatchByRootFromSqlite,
  loadStatementBatchToSqlite,
} from "../../lib/graph/etl/load/adapters/sqlite.js";
import {
  queryAllRootsInPostgres,
  queryAllRootsInSqlite,
  queryExistingRoots,
} from "../../lib/graph/etl/load/queryExistingRoots.js";
import { transformStatementBatchToGraphRows } from "../../lib/graph/etl/transform/statementBatchToGraphRows.js";
import { resolveGraphTarget, resolveStoreTarget } from "../../lib/project/config/project-settings.js";
import { getLocalFideWarnings } from "../query/shared.js";

export const statementsLoadCommand = defineCommand({
  surface: "statements.load",
  command: "fide statements load",
  outputType: "StatementsLoadOutput",
  summary: "Load local statements into a graph",
  usage: [
    "fide statements load --graph-key <graph-key>",
    "fide statements load --graph-key <graph-key> --from-date 2026-03-01 --to-date 2026-03-31",
    "fide statements load --graph-key <graph-key> --replace-roots",
    "fide statements load --graph-key <graph-key> --root-batch-count 250",
  ],
  paramOrder: ["graph-key", "from-date", "to-date", "root-batch-count", "replace-roots", "pretty"],
  params: {
    "graph-key": {
      kind: "string",
      required: true,
      description: "Graph key to load local statements into",
      valueLabel: "<graph-key>",
    },
    "from-date": {
      kind: "string",
      description: "Start date for local statement batches to load",
      valueLabel: "<YYYY-MM-DD>",
    },
    "to-date": {
      kind: "string",
      description: "End date for local statement batches to load",
      valueLabel: "<YYYY-MM-DD>",
    },
    "root-batch-count": {
      kind: "string",
      description: "Batch size for root dedup queries before parsing files",
      valueLabel: "<count>",
    },
    "replace-roots": {
      kind: "boolean",
      description:
        "Before loading, purge graph rows listed in `sourceDraftRootPendingReplacement` (string or array) inside dated `_meta.json` (honors the date range), clear those fields, then purge graph roots that have no `_meta.json` key and no local `.jsonl` batch",
    },
    pretty: { kind: "boolean", shorthand: "-p", description: "Human-readable output" },
  },
  examples: [
    "fide statements load --graph-key primary",
    "fide statements load --graph-key primary --from-date 2026-03-01 --to-date 2026-03-31",
    "fide statements load --graph-key primary --replace-roots",
    "fide statements load --graph-key primary --root-batch-count 250",
  ],
  notes: [
    "Loads canonical local statements from this project's `.fide/statements/` into the target graph.",
    "Date filters are inclusive and apply to the dated local statement batch layout.",
    "Batch roots are checked in chunks before parsing files so already-loaded batches can be skipped efficiently.",
    "With `--replace-roots`, reconcile `fide statements write --replace-draft`: remove superseded roots (including every batch that shared the draft path), clear pending markers in `_meta.json`, purge orphaned graph batches, then ingest.",
  ],
});

const STATEMENTS_LOAD_PARSE_KEYS = mergeBooleanKeySets(booleanKeysFromCommand(statementsLoadCommand));
const STATEMENTS_LOAD_SCOPE = "statements-load.v1";

export type StatementsLoadOutput = {
  ok: true;
  scope: typeof STATEMENTS_LOAD_SCOPE;
  command: "fide statements load";
  graphKey: string;
  graphStoreType: "postgres" | "sqlite";
  statementsDir: string;
  candidateFileCount: number;
  loadedFileCount: number;
  skippedRootCount: number;
  statementCount: number;
  rootBatchCount: number;
  fromDate?: string;
  toDate?: string;
  /** Whether `--replace-roots` was passed. */
  replaceRoots: boolean;
  /** Roots purged from the graph after reading `_meta.json` pending replacement fields. */
  supersededRootsPurged?: number;
  /** `_meta.json` files in the date range where at least one pending field was set to null. */
  statementsDayMetaFilesUpdated?: number;
  /** With `--replace-roots`, roots removed that are absent from every `_meta.json` key and every local `.jsonl` batch. */
  orphanedRootsPurged?: number;
  warnings: string[];
};

function normalizeDateFlag(value: string | undefined, flag: "--from-date" | "--to-date"): string | undefined {
  if (!value) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`Invalid ${flag} value: expected YYYY-MM-DD.`);
  }
  return value;
}

function normalizeRootBatchCount(value: string | undefined): number {
  if (!value) return 100;
  if (!/^\d+$/.test(value)) {
    throw new Error("Invalid --root-batch-count value: expected a positive integer.");
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error("Invalid --root-batch-count value: expected a positive integer.");
  }
  return parsed;
}

function chunkArray<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function printStatementsLoadProgress(enabled: boolean, message: string): void {
  if (!enabled) return;
  process.stderr.write(`${message}\n`);
}

function withBatchContext(
  error: unknown,
  input: { graphKey: string; batchRoot: string; batchFile: string },
): Error & { details: Record<string, unknown>; cause?: unknown } {
  const details =
    error && typeof error === "object" && "details" in error && typeof (error as { details?: unknown }).details === "object"
      ? { ...((error as { details: Record<string, unknown> }).details) }
      : {};
  const message = error instanceof Error ? error.message : String(error);
  const wrapped = new Error(`Failed loading batch ${input.batchRoot} into graph "${input.graphKey}": ${message}`) as
    Error & { details: Record<string, unknown>; cause?: unknown };
  wrapped.details = {
    graphKey: input.graphKey,
    batchRoot: input.batchRoot,
    batchFile: input.batchFile,
    ...details,
  };
  if (error !== undefined) {
    wrapped.cause = error;
  }
  return wrapped;
}

export async function runStatementsLoad(args: string[] = []): Promise<number> {
  const parsed = parseArgs(args, { booleanKeys: STATEMENTS_LOAD_PARSE_KEYS });
  if (hasFlag(parsed.flags, "help") || hasFlag(parsed.flags, "-h")) {
    console.log(renderCommandHelp(statementsLoadCommand));
    return 0;
  }

  const graphKeyFlag =
    typeof parsed.flags.get("graph-key") === "string" ? String(parsed.flags.get("graph-key")) : undefined;
  const graphKey = graphKeyFlag ? assertGraphKey(graphKeyFlag) : undefined;
  const fromDate = normalizeDateFlag(
    typeof parsed.flags.get("from-date") === "string" ? String(parsed.flags.get("from-date")) : undefined,
    "--from-date",
  );
  const toDate = normalizeDateFlag(
    typeof parsed.flags.get("to-date") === "string" ? String(parsed.flags.get("to-date")) : undefined,
    "--to-date",
  );
  const rootBatchCount = normalizeRootBatchCount(
    typeof parsed.flags.get("root-batch-count") === "string"
      ? String(parsed.flags.get("root-batch-count"))
      : undefined,
  );
  const replaceRoots = hasFlag(parsed.flags, "replace-roots");
  if (!graphKey) {
    throw new Error("Missing required flag: --graph-key <graph-key>.");
  }
  if (fromDate && toDate && fromDate > toDate) {
    throw new Error("`--from-date` must be on or before `--to-date`.");
  }

  const showProgress = true;
  printStatementsLoadProgress(showProgress, `Resolving graph "${graphKey}"...`);

  const graphTarget = resolveGraphTarget(parsed.flags);
  const statementsDir = resolve(graphTarget.root, ".fide", "statements");
  printStatementsLoadProgress(showProgress, `Connecting to graph "${graphKey}"...`);
  const target = resolveStoreTarget(new Map<string, string | boolean>([["graph", graphKey]]));
  if (target.type === "fide-jsonl") {
    throw new Error("`fide statements load` only supports sqlite and postgres graphs.");
  }
  if (target.type === "sqlite") {
    printStatementsLoadProgress(showProgress, `Connected to sqlite graph at ${target.file}`);
  } else if (target.databaseUrl) {
    printStatementsLoadProgress(showProgress, `Connected to postgres graph schema ${target.schema}`);
  } else {
    printStatementsLoadProgress(showProgress, `Postgres graph "${graphKey}" requires a resolved database URL before loading.`);
  }

  let supersededRootsPurged = 0;
  let statementsDayMetaFilesUpdated = 0;
  let orphanedRootsPurged = 0;
  if (replaceRoots) {
    printStatementsLoadProgress(
      showProgress,
      "`--replace-roots`: scanning dated `_meta.json` for `sourceDraftRootPendingReplacement`...",
    );
    const superseded = await collectSupersededRootsFromStatementsDayMeta(statementsDir, { fromDate, toDate });
    if (superseded.size > 0) {
      printStatementsLoadProgress(
        showProgress,
        `  purging ${superseded.size} superseded batch root(s) from the graph before load`,
      );
      for (const oldRoot of superseded) {
        if (target.type === "sqlite") {
          await deleteStatementBatchByRootFromSqlite(target.file, oldRoot);
        } else {
          if (!target.databaseUrl) {
            throw new Error(
              `Missing postgres connection for graph "${graphKey}". Configure connection.url in .fide/graphs/${graphKey}/config.json or set the referenced env var.`,
            );
          }
          await deleteStatementBatchByRootFromPostgres({
            databaseUrl: target.databaseUrl,
            schema: target.schema,
            root: oldRoot,
          });
        }
        supersededRootsPurged += 1;
      }
      const metaPaths = await listStatementsDayMetaPaths(statementsDir, { fromDate, toDate });
      for (const metaPath of metaPaths) {
        if (await clearSourceDraftRootPendingReplacementInMetaFile(metaPath)) {
          statementsDayMetaFilesUpdated += 1;
        }
      }
    }

    const retainedRoots = new Set<string>();
    for (const metaPath of await listStatementsDayMetaPaths(statementsDir)) {
      let doc: unknown;
      try {
        doc = JSON.parse(await readFile(metaPath, "utf8"));
      } catch {
        continue;
      }
      if (doc && typeof doc === "object") {
        for (const key of Object.keys(doc as Record<string, unknown>)) {
          retainedRoots.add(key);
        }
      }
    }
    for (const candidate of await listStatementBatchCandidates(statementsDir)) {
      retainedRoots.add(candidate.root);
    }

    if (target.type === "sqlite") {
      for (const root of await queryAllRootsInSqlite(target.file)) {
        if (!retainedRoots.has(root)) {
          await deleteStatementBatchByRootFromSqlite(target.file, root);
          orphanedRootsPurged += 1;
        }
      }
    } else if (target.databaseUrl) {
      for (const root of await queryAllRootsInPostgres(target.databaseUrl, target.schema)) {
        if (!retainedRoots.has(root)) {
          await deleteStatementBatchByRootFromPostgres({
            databaseUrl: target.databaseUrl,
            schema: target.schema,
            root,
          });
          orphanedRootsPurged += 1;
        }
      }
    }

    if (orphanedRootsPurged > 0) {
      printStatementsLoadProgress(
        showProgress,
        `  purged ${orphanedRootsPurged} orphaned batch root(s) (not in any \`_meta.json\` and no local \`.jsonl\`)`,
      );
    }
  }

  printStatementsLoadProgress(showProgress, `Scanning local statement batches in ${statementsDir}...`);
  const candidates = await listStatementBatchCandidates(statementsDir, { fromDate, toDate });
  printStatementsLoadProgress(showProgress, `Found ${candidates.length} candidate batch file(s).`);

  const existingRoots = new Set<string>();
  printStatementsLoadProgress(showProgress, `Checking existing roots in batches of ${rootBatchCount}...`);
  try {
    for (const chunk of chunkArray(candidates, rootBatchCount)) {
      const foundRoots = await queryExistingRoots(
        target.type === "sqlite"
          ? { type: "sqlite", file: target.file }
          : { type: "postgres", databaseUrl: target.databaseUrl, schema: target.schema },
        chunk.map((candidate) => candidate.root),
      );
      for (const root of foundRoots) {
        existingRoots.add(root);
      }
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes("Initialize the graph first")) {
      throw new Error(
        `${error.message}\nRun \`fide graph connect --graph-key ${graphKey} --initialize\` for this graph, then retry \`fide statements load --graph-key ${graphKey}\`.`,
      );
    }
    throw error;
  }

  const pendingCandidates = candidates.filter((candidate) => !existingRoots.has(candidate.root));
  printStatementsLoadProgress(
    showProgress,
    `Skipping ${existingRoots.size} existing batch root(s); loading ${pendingCandidates.length} batch file(s).`,
  );
  let statementCount = 0;
  if (pendingCandidates.length > 0) {
    if (target.type === "sqlite") {
      for (const [index, candidate] of pendingCandidates.entries()) {
        try {
          printStatementsLoadProgress(
            showProgress,
            `Loading batch ${index + 1}/${pendingCandidates.length}: ${candidate.root}`,
          );
          printStatementsLoadProgress(showProgress, `  reading ${candidate.file}`);
          const raw = await readFile(candidate.file, "utf8");
          printStatementsLoadProgress(showProgress, "  parsing statements");
          const parsedBatch = await parseGraphStatementBatchJsonl(raw);
          printStatementsLoadProgress(showProgress, `  parsed ${parsedBatch.statements.length} statement(s)`);
          const rows = transformStatementBatchToGraphRows({ root: candidate.root, statements: parsedBatch.statements });
          printStatementsLoadProgress(
            showProgress,
            `  loading rows: ${rows.referenceIdentifiers.length} reference identifier(s), ${rows.statements.length} statement(s), ${rows.statementRoots.length} statement-root link(s)`,
          );
          const result = await loadStatementBatchToSqlite(target.file, rows);
          statementCount += result.statementCount;
          printStatementsLoadProgress(showProgress, `  loaded ${result.statementCount} statement(s)`);
        } catch (error) {
          throw withBatchContext(error, {
            graphKey,
            batchRoot: candidate.root,
            batchFile: candidate.file,
          });
        }
      }
    } else {
      if (!target.databaseUrl) {
        throw new Error(
          `Missing postgres connection for graph "${graphKey}". Configure connection.url in .fide/graphs/${graphKey}/config.json or set the referenced env var.`,
        );
      }
      for (const [index, candidate] of pendingCandidates.entries()) {
        try {
          printStatementsLoadProgress(
            showProgress,
            `Loading batch ${index + 1}/${pendingCandidates.length}: ${candidate.root}`,
          );
          printStatementsLoadProgress(showProgress, `  reading ${candidate.file}`);
          const raw = await readFile(candidate.file, "utf8");
          printStatementsLoadProgress(showProgress, "  parsing statements");
          const parsedBatch = await parseGraphStatementBatchJsonl(raw);
          printStatementsLoadProgress(showProgress, `  parsed ${parsedBatch.statements.length} statement(s)`);
          const rows = transformStatementBatchToGraphRows({ root: candidate.root, statements: parsedBatch.statements });
          printStatementsLoadProgress(
            showProgress,
            `  loading rows: ${rows.referenceIdentifiers.length} reference identifier(s), ${rows.statements.length} statement(s), ${rows.statementRoots.length} statement-root link(s)`,
          );
          const result = await loadStatementBatchToPostgres({
            databaseUrl: target.databaseUrl,
            schema: target.schema,
            rows,
          });
          statementCount += result.statementCount;
          printStatementsLoadProgress(showProgress, `  loaded ${result.statementCount} statement(s)`);
        } catch (error) {
          throw withBatchContext(error, {
            graphKey,
            batchRoot: candidate.root,
            batchFile: candidate.file,
          });
        }
      }
    }
  }
  printStatementsLoadProgress(showProgress, `Completed load into graph "${graphKey}".`);

  const payload: StatementsLoadOutput = {
    ok: true,
    scope: STATEMENTS_LOAD_SCOPE,
    command: "fide statements load",
    graphKey,
    graphStoreType: target.type,
    statementsDir,
    candidateFileCount: candidates.length,
    loadedFileCount: pendingCandidates.length,
    skippedRootCount: existingRoots.size,
    statementCount,
    rootBatchCount,
    replaceRoots,
    ...(replaceRoots
      ? {
          supersededRootsPurged,
          statementsDayMetaFilesUpdated,
          orphanedRootsPurged,
        }
      : {}),
    ...(fromDate ? { fromDate } : {}),
    ...(toDate ? { toDate } : {}),
    warnings: getLocalFideWarnings(graphTarget.root, { gitignore: graphTarget.gitignore }),
  };

  if (shouldUseJsonOutput(parsed.flags)) {
    printJson(payload);
  } else {
    console.log(formatPretty(STATEMENTS_LOAD_SCOPE, payload) ?? JSON.stringify(payload, null, 2));
  }
  return 0;
}
