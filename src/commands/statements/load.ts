// fide statements load --graph-key primary_sb_test
// fide statements load --graph-key sqlite-test



import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseGraphStatementBatchJsonl, resolveGraphTarget, resolveStoreTarget } from "@chris-test/graph";
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
import { listStatementBatchCandidates } from "../../util/project/graph-etl/extract/listStatementBatches.js";
import { loadStatementBatchToPostgres } from "../../util/project/graph-etl/load/adapters/postgres.js";
import { loadStatementBatchToSqlite } from "../../util/project/graph-etl/load/adapters/sqlite.js";
import { queryExistingRoots } from "../../util/project/graph-etl/load/queryExistingRoots.js";
import { transformStatementBatchToGraphRows } from "../../util/project/graph-etl/transform/statementBatchToGraphRows.js";
import { getLocalFideWarnings } from "../query/shared.js";

export const statementsLoadCommand = defineCommand({
  surface: "statements.load",
  command: "fide statements load",
  outputType: "StatementsLoadOutput",
  summary: "Load local statements into a graph",
  usage: [
    "fide statements load --graph-key <graph-key>",
    "fide statements load --graph-key <graph-key> --from-date 2026-03-01 --to-date 2026-03-31",
    "fide statements load --graph-key <graph-key> --root-batch-count 250",
  ],
  paramOrder: ["graph-key", "from-date", "to-date", "root-batch-count", "pretty"],
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
    pretty: { kind: "boolean", shorthand: "-p", description: "Human-readable output" },
  },
  examples: [
    "fide statements load --graph-key primary",
    "fide statements load --graph-key primary --from-date 2026-03-01 --to-date 2026-03-31",
    "fide statements load --graph-key primary --root-batch-count 250",
  ],
  notes: [
    "Loads canonical local statements from this project's `.fide/statements/` into the target graph.",
    "Date filters are inclusive and apply to the dated local statement batch layout.",
    "Batch roots are checked in chunks before parsing files so already-loaded batches can be skipped efficiently.",
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

  printStatementsLoadProgress(showProgress, `Scanning local statement batches in ${statementsDir}...`);
  const candidates = await listStatementBatchCandidates(statementsDir, { fromDate, toDate });
  printStatementsLoadProgress(showProgress, `Found ${candidates.length} candidate batch file(s).`);

  const existingRoots = new Set<string>();
  printStatementsLoadProgress(showProgress, `Checking existing roots in batches of ${rootBatchCount}...`);
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

  const pendingCandidates = candidates.filter((candidate) => !existingRoots.has(candidate.root));
  printStatementsLoadProgress(
    showProgress,
    `Skipping ${existingRoots.size} existing batch root(s); loading ${pendingCandidates.length} batch file(s).`,
  );
  let statementCount = 0;
  if (pendingCandidates.length > 0) {
    if (target.type === "sqlite") {
      for (const [index, candidate] of pendingCandidates.entries()) {
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
      }
    } else {
      if (!target.databaseUrl) {
        throw new Error(
          `Missing postgres connection for graph "${graphKey}". Configure connection.url in .fide/graphs/${graphKey}/config.json or set the referenced env var.`,
        );
      }
      for (const [index, candidate] of pendingCandidates.entries()) {
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
