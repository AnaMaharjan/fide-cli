import { mkdir } from "node:fs/promises";
import { basename, dirname, extname, relative, resolve, sep } from "node:path";
import { executeGraphQuery, writeSqliteTableFromRows } from "@chris-test/graph";
import { parseArgs } from "../../util/command/args.js";
import {
  booleanKeysFromCommand,
  defineCommand,
  mergeBooleanKeySets,
  renderCommandHelp,
} from "../../util/command/command-metadata.js";
import { printJson, readUtf8, writeUtf8 } from "../../util/command/io.js";
import { formatPretty } from "../../util/command/pretty.js";
import {
  assertLocalQueryableStore,
  getLocalFideWarnings,
  resolveQueryFileSelector,
  resolveGraphQueryScope,
  resolveGraphTarget,
  resolveQuerySql,
  resolveStoreTarget,
  shouldUseJsonOutput,
} from "./shared.js";
import type { ResolvedSqliteGraphStore, ResolvedStoreTarget } from "../../lib/project/config/project-settings.js";

export const queryRunCommand = defineCommand({
  surface: "query.run",
  command: "fide query run",
  outputType: "QueryRunOutput",
  summary: "Run a query against a graph and write the result",
  omitUsageInHelp: true,
  usage: [
    "fide query run --from-graph-key <key> <query> --to-fide-path results/rows.json",
    "fide query run --from-graph-key <key> --file .fide/graphs/<graph-key>/queries/<query> --to-fide-path results/rows.json",
    "fide query run --from-fide-path graphs/sqlite-test/query-results/queries.sqlite 'select * from entity_anchors_0' --to-project-path reports/rows.json",
  ],
  paramOrder: ["from-graph-key", "from-fide-path", "from-project-path", "file", "stdin", "to-fide-path", "to-project-path", "pretty"],
  params: {
    "from-graph-key": { kind: "string", description: "Run the query against a configured graph", valueLabel: "<key>" },
    "from-fide-path": { kind: "string", description: "Run the query against a sqlite file relative to the active .fide directory", valueLabel: "<sqlite-path>" },
    "from-project-path": { kind: "string", description: "Run the query against a sqlite file relative to the project root", valueLabel: "<sqlite-path>" },
    file: { kind: "string", description: "Read query input from a saved query file path", valueLabel: "<query-file-path>" },
    stdin: { kind: "boolean", description: "Read query input from stdin" },
    "to-fide-path": { kind: "string", description: "Write query output relative to the active .fide directory", valueLabel: "<path>" },
    "to-project-path": { kind: "string", description: "Write query output relative to the project root", valueLabel: "<path>" },
    pretty: { kind: "boolean", shorthand: "-p", description: "Human-readable output" },
  },
  values: [
    {
      label: "<query>",
      value: "string",
      suggested: '".fide/graphs/<graph-key>/queries/<query>.sql"',
    },
    {
      label: "<path>",
      value: "string",
      children: [
        {
          label: "format inference",
          value: ['".json"', '".jsonl"', '".csv"', '".sqlite"'],
        },
        {
          label: "with `to-fide-path`",
          value: '"results/rows.json"',
          suggested: '"resolved inside the active .fide directory"',
        },
        {
          label: "with `to-project-path`",
          value: '"reports/rows.json"',
          suggested: '"resolved from the project root"',
        },
        {
          label: 'with `".sqlite"` output',
          value: '"writes rows into a sqlite table"',
          suggested: '"table name comes from the saved query file name, or from the output file name for inline queries"',
        },
      ],
    },
  ],
  examples: [
    "fide query run --from-graph-key primary 'select * from statements limit 10' --to-fide-path results/rows.json",
    "fide query run --from-graph-key primary 'select * from statements limit 10' --to-project-path reports/rows.csv",
    "fide query run --from-graph-key primary --file .fide/graphs/primary/queries/recentStatements.sql --to-fide-path results/rows.sqlite",
    "fide query run --from-fide-path graphs/sqlite-test/query-results/queries.sqlite 'select * from entity_anchors_0 limit 10' --to-project-path reports/rows.json",
    "fide query run --from-graph-key primary --stdin --to-project-path reports/rows.jsonl",
  ],
  notes: [
    "Saved-query execution resolves from local query files under the active project's `.fide/graphs/<graphKey>/queries/`.",
    "Use exactly one of `--from-graph-key`, `--from-fide-path`, or `--from-project-path`.",
    "Path-based input sources currently support only `.sqlite` files.",
    "Run saved queries from the target project root so `--file .fide/...` resolves against the intended local `.fide` directory.",
    "File output format is inferred from the destination extension: `.json`, `.jsonl`, `.csv`, or `.sqlite`. Unknown or missing extensions default to JSON.",
    "When the destination ends in `.sqlite`, query rows are materialized into a table. Saved queries use the query file name as the table name.",
    "Use exactly one of `--to-fide-path` or `--to-project-path`.",
    "Query run writes the query result shape as returned by the query. Batch-aware loading belongs to `fide batches load`.",
  ],
});

const QUERY_RUN_PARSE_KEYS = mergeBooleanKeySets(booleanKeysFromCommand(queryRunCommand));
const QUERY_RUN_SCOPE = "graph-query-run-local.v1";

export type QueryRunOutput = {
  ok: true;
  scope: typeof QUERY_RUN_SCOPE;
  command: "fide query run";
  targetScope: "local";
  source: string;
  destination: string;
  rowCount: number;
  outPath?: string;
  warnings: string[];
};

type QueryRunFileFormat = "json" | "jsonl" | "csv" | "sqlite";

type QueryResultLeafMeta = {
  recordedAtUTC?: string;
  /** @deprecated Prefer `recordedAtUTC`; retained for existing `_meta.json` files. */
  writtenAtUTC?: string;
  rowCount: number;
  sourceQueryPath?: string;
};

type QueryResultFileMeta = QueryResultLeafMeta | Record<string, QueryResultLeafMeta>;
type QueryResultFolderMeta = Record<string, QueryResultFileMeta>;

function resolveQueryRunDestination(
  projectRoot: string,
  fideDir: string,
  toFidePath: string | null,
  toProjectPath: string | null,
): { destination: string; outPath: string } {
  if (toFidePath && toProjectPath) {
    throw new Error("Use exactly one of --to-fide-path <path> or --to-project-path <path>.");
  }
  if (!toFidePath && !toProjectPath) {
    throw new Error("Missing required destination. Use --to-fide-path <path> or --to-project-path <path>.");
  }

  if (toFidePath) {
    return {
      destination: toFidePath,
      outPath: resolve(fideDir, toFidePath),
    };
  }

  return {
    destination: toProjectPath as string,
    outPath: resolve(projectRoot, toProjectPath as string),
  };
}

function inferQueryRunFileFormat(path: string): QueryRunFileFormat {
  const extension = extname(path).toLowerCase();
  if (extension === ".sqlite") return "sqlite";
  if (extension === ".jsonl") return "jsonl";
  if (extension === ".csv") return "csv";
  return "json";
}

function toCsvScalar(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") return String(value);
  return JSON.stringify(value);
}

function escapeCsvField(value: unknown): string {
  const scalar = toCsvScalar(value);
  if (/[",\n\r]/.test(scalar)) {
    return `"${scalar.replaceAll('"', '""')}"`;
  }
  return scalar;
}

function formatQueryRunFileContent(
  format: QueryRunFileFormat,
  rows: unknown[],
): string {
  if (format === "sqlite") {
    throw new Error("SQLite output is written via a dedicated materialization path.");
  }
  if (format === "json") {
    return `${JSON.stringify(rows, null, 2)}\n`;
  }

  if (format === "jsonl") {
    const rowLines = rows.map((row) => JSON.stringify(row));
    return rowLines.length > 0 ? `${rowLines.join("\n")}\n` : "";
  }

  const objectRows = rows.every((row) => row && typeof row === "object" && !Array.isArray(row));
  if (!objectRows) {
    throw new Error("CSV output requires row objects.");
  }
  const headers = Array.from(new Set(rows.flatMap((row) => Object.keys(row as Record<string, unknown>))));
  const lines = [
    headers.map((header) => escapeCsvField(header)).join(","),
    ...rows.map((row) =>
      headers
        .map((header) => escapeCsvField((row as Record<string, unknown>)[header]))
        .join(","),
    ),
  ];
  return `${lines.join("\n")}\n`;
}

function resolveSqliteOutputTableName(filePath: string | null, outPath: string, graphRoot: string): string {
  if (filePath) {
    return resolveQueryFileSelector(graphRoot, filePath).name;
  }
  return basename(outPath, ".sqlite") || "query_result";
}

function toProjectRelativePath(projectRoot: string, filePath: string): string | null {
  const relativePath = relative(projectRoot, filePath);
  if (!relativePath || relativePath.startsWith(`..${sep}`) || relativePath === "..") {
    return null;
  }
  return relativePath.split(sep).join("/");
}

function isQueryResultLeafMeta(value: QueryResultFileMeta | undefined): value is QueryResultLeafMeta {
  if (!value || typeof value !== "object" || !("rowCount" in value)) return false;
  return "recordedAtUTC" in value || "writtenAtUTC" in value;
}

async function updateQueryResultMeta(
  metaPath: string,
  input: {
    outputFileName: string;
    tableName?: string;
    recordedAtUTC: string;
    rowCount: number;
    sourceQueryPath?: string;
  },
): Promise<void> {
  let meta: QueryResultFolderMeta = {};
  try {
    meta = JSON.parse(await readUtf8(metaPath)) as QueryResultFolderMeta;
  } catch {
    meta = {};
  }

  const leaf: QueryResultLeafMeta = {
    recordedAtUTC: input.recordedAtUTC,
    rowCount: input.rowCount,
    ...(input.sourceQueryPath ? { sourceQueryPath: input.sourceQueryPath } : {}),
  };

  if (input.tableName) {
    const existing = meta[input.outputFileName];
    const next = !existing || isQueryResultLeafMeta(existing) ? {} : existing;
    next[input.tableName] = leaf;
    meta[input.outputFileName] = next;
  } else {
    meta[input.outputFileName] = leaf;
  }

  await writeUtf8(metaPath, `${JSON.stringify(meta, null, 2)}\n`);
}

function assertSqliteInputPath(kind: "--from-fide-path" | "--from-project-path", filePath: string): void {
  if (extname(filePath).toLowerCase() !== ".sqlite") {
    throw new Error(`Only .sqlite inputs are supported for ${kind} right now.`);
  }
}

function resolveQueryRunSource(
  flags: Map<string, string | boolean>,
  projectRoot: string,
  fideDir: string,
): { source: string; target: Exclude<ResolvedStoreTarget, { type: "fide-jsonl" }> } {
  const fromGraphKey = typeof flags.get("from-graph-key") === "string" ? String(flags.get("from-graph-key")) : null;
  const fromFidePath = typeof flags.get("from-fide-path") === "string" ? String(flags.get("from-fide-path")) : null;
  const fromProjectPath = typeof flags.get("from-project-path") === "string" ? String(flags.get("from-project-path")) : null;
  const selectors = [fromGraphKey, fromFidePath, fromProjectPath].filter((value) => value !== null);
  if (selectors.length !== 1) {
    throw new Error("Use exactly one of --from-graph-key <key>, --from-fide-path <sqlite-path>, or --from-project-path <sqlite-path>.");
  }

  if (fromGraphKey) {
    return {
      source: `graph:${fromGraphKey}`,
      target: assertLocalQueryableStore(
        fromGraphKey,
        resolveStoreTarget(new Map<string, string | boolean>([["graph", fromGraphKey]])),
        flags,
      ),
    };
  }

  if (fromFidePath) {
    assertSqliteInputPath("--from-fide-path", fromFidePath);
    return {
      source: `fide-path:${fromFidePath}`,
      target: {
        type: "sqlite",
        key: null,
        configuredFromSettings: false,
        file: resolve(fideDir, fromFidePath),
        gitignore: null,
      } satisfies ResolvedSqliteGraphStore,
    };
  }

  const projectPath = fromProjectPath as string;
  assertSqliteInputPath("--from-project-path", projectPath);
  return {
    source: `project-path:${projectPath}`,
    target: {
      type: "sqlite",
      key: null,
      configuredFromSettings: false,
      file: resolve(projectRoot, projectPath),
      gitignore: null,
    } satisfies ResolvedSqliteGraphStore,
  };
}

export async function runQueryRun(args: string[]): Promise<number> {
  const initialParsed = parseArgs(args, { booleanKeys: QUERY_RUN_PARSE_KEYS });
  if (initialParsed.flags.has("help") || initialParsed.flags.has("-h")) {
    console.log(renderCommandHelp(queryRunCommand));
    return 0;
  }

  const flags = initialParsed.flags;
  await resolveGraphQueryScope(flags);
  const localTarget = resolveGraphTarget(flags);
  const filePath = typeof flags.get("file") === "string" ? String(flags.get("file")) : null;
  const toFidePath = typeof flags.get("to-fide-path") === "string" ? String(flags.get("to-fide-path")) : null;
  const toProjectPath = typeof flags.get("to-project-path") === "string" ? String(flags.get("to-project-path")) : null;
  const { parsed: resolvedParsed, sql } = await resolveQuerySql(args);
  if (!sql.trim()) {
    console.error("Missing query text for `fide query run`. Use `--stdin`, `--file <path>`, or pass the query inline.");
    console.error(renderCommandHelp(queryRunCommand));
    return 1;
  }

  const fideDir = resolve(localTarget.root, ".fide");
  const { source, target } = resolveQueryRunSource(flags, localTarget.root, fideDir);
  const { destination, outPath } = resolveQueryRunDestination(localTarget.root, fideDir, toFidePath, toProjectPath);
  const fileFormat = inferQueryRunFileFormat(outPath);
  const result = await executeGraphQuery({
    target,
    sql,
  });
  const rowCount = result.rowCount;
  const recordedAtUTC = new Date().toISOString();
  const sourceQueryPath = filePath ? toProjectRelativePath(localTarget.root, resolve(filePath)) ?? undefined : undefined;
  const outputFileName = basename(outPath);
  if (fileFormat === "sqlite") {
    const tableName = resolveSqliteOutputTableName(filePath, outPath, localTarget.root);
    await mkdir(dirname(outPath), { recursive: true });
    await writeSqliteTableFromRows(outPath, tableName, result.rows);
    await updateQueryResultMeta(resolve(dirname(outPath), "_meta.json"), {
      outputFileName,
      tableName,
      recordedAtUTC,
      rowCount,
      sourceQueryPath,
    });
  } else {
    await writeUtf8(outPath, formatQueryRunFileContent(fileFormat, result.rows));
    await updateQueryResultMeta(resolve(dirname(outPath), "_meta.json"), {
      outputFileName,
      recordedAtUTC,
      rowCount,
      sourceQueryPath,
    });
  }

  const payload: QueryRunOutput = {
    ok: true,
    scope: QUERY_RUN_SCOPE,
    command: "fide query run",
    targetScope: "local",
    source,
    destination,
    rowCount,
    outPath,
    warnings: getLocalFideWarnings(localTarget.root, { gitignore: localTarget.gitignore }),
  };
  if (shouldUseJsonOutput(resolvedParsed.flags)) {
    printJson(payload);
  } else {
    console.log(formatPretty(QUERY_RUN_SCOPE, payload));
  }
  return 0;
}
