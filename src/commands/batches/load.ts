import { readdir, readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import {
  buildStatementsWithRoot,
  buildStatementsWithRootFromRecipe,
  classifyJsonStatementDocumentRows,
  deleteStatementBatchByBatchFromSqlite,
  parseJsonStatementDocument,
  parseJsonStatementRecipeDocument,
  queryBatchRootByLocalWorkspacePath,
  transformStatementBatchToGraphRows,
  upsertStatementBatchToSqlite,
  type StatementInput,
} from "@chris-test/graph";
import { refreshResolvedEntityProfiles } from "../../lib/graph/resolution/refresh-resolved-entity-profiles.js";
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
  graphStoreType: "sqlite";
  batchesPath: string;
  candidateFileCount: number;
  loadedFileCount: number;
  updatedFileCount: number;
  replacedFileCount: number;
  statementCount: number;
  entries: BatchLoadEntry[];
  resolvedAnchorsProjection?: {
    evaluatedEdgeCount: number;
    acceptedEdgeCount: number;
    rejectedEdgeCount: number;
    needsReviewEdgeCount: number;
    evaluator: string;
  };
  resolvedAnchorsProjectionError?: string;
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
    "For replacements where path points to an old batch_root, the old root is removed first.",
    "When root matches, statement membership is updated incrementally (delta add/remove).",
    "createdAtUTC and updatedAtUTC from each .batch.json are treated as source-of-truth.",
    "After load, resolved profile projection tables are refreshed from evaluated identity links.",
    "Set `resolution.hook` in `.fide/graphs/<graph-key>/config.json` to customize sameAs evaluation decisions.",
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
  if (target.type !== "sqlite") {
    throw new Error("`fide batches load` supports sqlite graphs only.");
  }
  const storeTarget = { type: "sqlite" as const, key: null, file: target.file };

  const entries: BatchLoadEntry[] = [];
  let loadedFileCount = 0;
  const updatedFileCount = 0;
  let replacedFileCount = 0;
  let statementCount = 0;

  const preparedRows = new Map<string, ReturnType<typeof transformStatementBatchToGraphRows>>();
  const preparedStatementCounts = new Map<string, number>();
  const preparedRoots = new Map<string, string>();

  for (const file of files) {
    const batchDoc = await readBatchJson(file);
    const built = batchDoc.recipeRows
      ? await buildStatementsWithRootFromRecipe(batchDoc.recipeRows, { normalizeReferenceIdentifier: true })
      : await buildStatementsWithRoot(batchDoc.statementInputs ?? [], { normalizeReferenceIdentifier: true });
    const batchRoot = built.root;
    preparedRoots.set(file, batchRoot);
    preparedStatementCounts.set(file, built.statements.length);
    preparedRows.set(file, transformStatementBatchToGraphRows({
      batch: batchRoot,
      localWorkspacePath: file,
      createdAtUtc: batchDoc.createdAtUtc,
      updatedAtUtc: batchDoc.updatedAtUtc,
      title: batchDoc.title,
      description: batchDoc.description,
      statements: built.statements,
    }));
  }

  for (const file of files) {
    const batchRoot = preparedRoots.get(file) ?? "";
    const rows = preparedRows.get(file);
    if (!rows) continue;
    const existingByPath = await queryBatchRootByLocalWorkspacePath(storeTarget, file);
    let replaced = false;
    if (existingByPath && existingByPath !== batchRoot) {
      await deleteStatementBatchByBatchFromSqlite(target.file, existingByPath);
      replaced = true;
    }

    const result = await upsertStatementBatchToSqlite(target.file, rows);
    if (result.insertedStatementBatch) {
      loadedFileCount += 1;
      statementCount += result.statementCount;
    }
    if (replaced) {
      replacedFileCount += 1;
    }
    entries.push({
      path: file,
      batchRoot,
      statementCount: preparedStatementCounts.get(file) ?? 0,
      mode: replaced ? "replaced" : "inserted",
    });
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

  try {
    payload.resolvedAnchorsProjection = await refreshResolvedEntityProfiles({
      graphKey,
      target: storeTarget,
    });
  } catch (error) {
    payload.resolvedAnchorsProjectionError = error instanceof Error ? error.message : String(error);
  }
  if (shouldUseJsonOutput(parsed.flags)) {
    printJson(payload);
  } else {
    console.log(formatPretty("batches-load.v1", payload));
  }
  return 0;
}
