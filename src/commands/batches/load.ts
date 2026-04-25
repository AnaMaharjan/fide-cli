import { readdir, readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import {
  buildStatementsWithRoot,
  buildStatementsWithRootFromRecipe,
  classifyJsonStatementDocumentRows,
  deleteStatementBatchByBatchFromDuckdb,
  deleteStatementBatchByBatchFromPostgres,
  deleteStatementBatchByBatchFromSqlite,
  loadStatementBatchToDuckdb,
  loadStatementBatchToPostgres,
  loadStatementBatchToSqlite,
  parseJsonStatementDocument,
  parseJsonStatementRecipeDocument,
  queryBatchRootByLocalWorkspacePath,
  queryExistingBatches,
  transformStatementBatchToGraphRows,
  type StatementInput,
} from "@chris-test/graph";
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
import { resolveStoreTarget } from "../../lib/project/config/project-settings.js";

type JsonObject = Record<string, unknown>;

type BatchLoadEntry = {
  path: string;
  batchRoot: string;
  statementCount: number;
  mode: "inserted" | "updated" | "replaced";
};

export type BatchesLoadOutput = {
  command: "fide batches load";
  graphKey: string;
  graphStoreType: "postgres" | "sqlite" | "duckdb";
  batchesPath: string;
  candidateFileCount: number;
  loadedFileCount: number;
  updatedFileCount: number;
  replacedFileCount: number;
  statementCount: number;
  entries: BatchLoadEntry[];
};

export const batchesLoadCommand = defineCommand({
  surface: "batches.load",
  command: "fide batches load",
  outputType: "BatchesLoadOutput",
  summary: "Load .batch.json files into a graph by graph key",
  usage: [
    "fide batches load --graph-key <graph-key> --batches <batch-file-or-dir>",
    "fide batches load --graph-key <graph-key> --batches .fide/batches",
  ],
  paramOrder: ["graph-key", "batches", "pretty"],
  params: {
    "graph-key": {
      kind: "string",
      required: true,
      valueLabel: "<graph-key>",
      description: "Graph key to load batches into",
    },
    batches: {
      kind: "string",
      required: true,
      valueLabel: "<batch-file-or-dir>",
      description: "Path to one .batch.json file or a directory containing batch files",
    },
    pretty: { kind: "boolean", shorthand: "-p", description: "Human-readable output" },
  },
  notes: [
    "Computes batch_root from statements and upserts metadata by local_workspace_path.",
    "For replacements, previous rows for the same local_workspace_path are removed before insert.",
    "createdAtUTC and updatedAtUTC from each .batch.json are treated as source-of-truth.",
  ],
});

const BATCHES_LOAD_PARSE_KEYS = mergeBooleanKeySets(booleanKeysFromCommand(batchesLoadCommand));

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function listBatchFiles(rootDir: string): Promise<string[]> {
  const entries = await readdir(rootDir, { withFileTypes: true });
  const out: string[] = [];
  for (const entry of entries) {
    const fullPath = resolve(rootDir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await listBatchFiles(fullPath)));
      continue;
    }
    if (entry.isFile() && fullPath.endsWith(".batch.json")) {
      out.push(fullPath);
    }
  }
  return out.sort((a, b) => a.localeCompare(b));
}

async function readBatchJson(path: string): Promise<{
  title?: string;
  description?: string;
  createdAtUtc?: string;
  updatedAtUtc?: string;
  statementInputs?: StatementInput[];
  recipeRows?: Array<{ batch_index: number; subject: StatementInput["subject"]; property: StatementInput["property"]; object: StatementInput["object"]; notes?: string }>;
}> {
  const raw = await readFile(path, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  if (!isObject(parsed)) {
    throw new Error(`Invalid batch JSON in ${path}: expected object.`);
  }
  if (!Array.isArray(parsed.statements)) {
    throw new Error(`Invalid batch JSON in ${path}: missing statements array.`);
  }
  const rowKind = classifyJsonStatementDocumentRows(parsed.statements);
  const statementInputs = rowKind === "resolved"
    ? parseJsonStatementDocument(raw).statements
    : undefined;
  const recipeRows = rowKind === "recipe"
    ? parseJsonStatementRecipeDocument(raw).statements
    : undefined;
  return {
    title: typeof parsed.title === "string" ? parsed.title : undefined,
    description: typeof parsed.description === "string" ? parsed.description : undefined,
    createdAtUtc: typeof parsed.createdAtUTC === "string" ? parsed.createdAtUTC : undefined,
    updatedAtUtc: typeof parsed.updatedAtUTC === "string" ? parsed.updatedAtUTC : undefined,
    statementInputs,
    recipeRows,
  };
}

export async function runBatchesLoad(args: string[]): Promise<number> {
  const parsed = parseArgs(args, { booleanKeys: BATCHES_LOAD_PARSE_KEYS });
  if (hasFlag(parsed.flags, "help")) {
    console.log(renderCommandHelp(batchesLoadCommand));
    return 0;
  }
  if (parsed.positionals.length > 0) {
    throw new Error(`Unexpected arguments: ${parsed.positionals.join(" ")}`);
  }

  const graphKeyRaw = parsed.flags.get("graph-key");
  if (typeof graphKeyRaw !== "string" || graphKeyRaw.length === 0) {
    throw new Error("Missing required flag: --graph-key <graph-key>.");
  }
  const graphKey = assertGraphKey(graphKeyRaw);
  const batchesFlag = parsed.flags.get("batches");
  if (typeof batchesFlag !== "string" || batchesFlag.length === 0) {
    throw new Error("Missing required flag: --batches <batch-file-or-dir>.");
  }

  const batchesPath = resolve(process.cwd(), batchesFlag);
  const batchesStat = await stat(batchesPath);
  const files = batchesStat.isDirectory() ? await listBatchFiles(batchesPath) : [batchesPath];
  if (files.length === 0) {
    throw new Error(`No .batch.json files found under ${batchesPath}.`);
  }

  const target = resolveStoreTarget(new Map<string, string | boolean>([["graph", graphKey]]));
  if (target.type === "fide-jsonl") {
    throw new Error("`fide batches load` only supports sqlite, duckdb, and postgres graphs.");
  }
  const storeTarget = target.type === "sqlite"
    ? { type: "sqlite" as const, file: target.file }
    : target.type === "duckdb"
      ? { type: "duckdb" as const, file: target.file }
      : { type: "postgres" as const, databaseUrl: target.databaseUrl, schema: target.schema };

  const entries: BatchLoadEntry[] = [];
  let loadedFileCount = 0;
  let updatedFileCount = 0;
  let replacedFileCount = 0;
  let statementCount = 0;

  for (const file of files) {
    const batchDoc = await readBatchJson(file);
    const built = batchDoc.recipeRows
      ? await buildStatementsWithRootFromRecipe(batchDoc.recipeRows, { normalizeReferenceIdentifier: true })
      : await buildStatementsWithRoot(batchDoc.statementInputs ?? [], { normalizeReferenceIdentifier: true });
    const batchRoot = built.root;

    const existingByPath = await queryBatchRootByLocalWorkspacePath(storeTarget, file);
    let replaced = false;
    if (existingByPath) {
      if (target.type === "sqlite") {
        await deleteStatementBatchByBatchFromSqlite(target.file, existingByPath);
      } else if (target.type === "duckdb") {
        await deleteStatementBatchByBatchFromDuckdb(target.file, existingByPath);
      } else {
        if (!target.databaseUrl) {
          throw new Error(
            `Missing postgres connection for graph "${graphKey}". Configure connection.url in .fide/graphs/${graphKey}/config.json or set the referenced env var.`,
          );
        }
        await deleteStatementBatchByBatchFromPostgres({
          databaseUrl: target.databaseUrl,
          schema: target.schema,
          batch: existingByPath,
        });
      }
      replaced = true;
    }

    const existingByRoot = await queryExistingBatches(storeTarget, [batchRoot]);
    if (existingByRoot.has(batchRoot)) {
      if (target.type === "sqlite") {
        await deleteStatementBatchByBatchFromSqlite(target.file, batchRoot);
      } else if (target.type === "duckdb") {
        await deleteStatementBatchByBatchFromDuckdb(target.file, batchRoot);
      } else {
        if (!target.databaseUrl) {
          throw new Error(
            `Missing postgres connection for graph "${graphKey}". Configure connection.url in .fide/graphs/${graphKey}/config.json or set the referenced env var.`,
          );
        }
        await deleteStatementBatchByBatchFromPostgres({
          databaseUrl: target.databaseUrl,
          schema: target.schema,
          batch: batchRoot,
        });
      }
      replaced = true;
    }

    const rows = transformStatementBatchToGraphRows({
      batch: batchRoot,
      localWorkspacePath: file,
      createdAtUtc: batchDoc.createdAtUtc,
      updatedAtUtc: batchDoc.updatedAtUtc,
      title: batchDoc.title,
      description: batchDoc.description,
      statements: built.statements,
    });
    if (target.type === "sqlite") {
      const result = await loadStatementBatchToSqlite(target.file, rows);
      if (result.insertedStatementBatch) {
        loadedFileCount += 1;
        statementCount += result.statementCount;
      }
    } else if (target.type === "duckdb") {
      const result = await loadStatementBatchToDuckdb(target.file, rows);
      if (result.insertedStatementBatch) {
        loadedFileCount += 1;
        statementCount += result.statementCount;
      }
    } else {
      if (!target.databaseUrl) {
        throw new Error(
          `Missing postgres connection for graph "${graphKey}". Configure connection.url in .fide/graphs/${graphKey}/config.json or set the referenced env var.`,
        );
      }
      const result = await loadStatementBatchToPostgres({
        databaseUrl: target.databaseUrl,
        schema: target.schema,
        rows,
      });
      if (result.insertedStatementBatch) {
        loadedFileCount += 1;
        statementCount += result.statementCount;
      }
    }
    if (replaced) {
      replacedFileCount += 1;
    }
    entries.push({ path: file, batchRoot, statementCount: built.statements.length, mode: replaced ? "replaced" : "inserted" });
  }

  const payload: BatchesLoadOutput = {
    command: "fide batches load",
    graphKey,
    graphStoreType: target.type,
    batchesPath,
    candidateFileCount: files.length,
    loadedFileCount,
    updatedFileCount,
    replacedFileCount,
    statementCount,
    entries,
  };
  if (shouldUseJsonOutput(parsed.flags)) {
    printJson(payload);
  } else {
    console.log(formatPretty("batches-load.v1", payload));
  }
  return 0;
}
