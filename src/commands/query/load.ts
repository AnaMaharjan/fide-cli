import { executeGraphQuery, querySqliteResolvedStatements } from "@chris-test/graph-db";
import { extname, resolve } from "node:path";
import { parseArgs } from "../../util/command/args.js";
import { formatGraphStatementBatchJsonl, type GraphStatementWire } from "@chris-test/graph";
import {
  booleanKeysFromCommand,
  defineCommand,
  mergeBooleanKeySets,
  renderCommandHelp,
} from "../../util/command/command-metadata.js";
import { printJson, writeUtf8 } from "../../util/command/io.js";
import { formatPretty } from "../../util/command/pretty.js";
import { parseTransportSelector, resolveTransportFilePath } from "../../util/transport/selectors.js";
import {
  assertLocalQueryableStore,
  createCliStructuredError,
  getLocalFideWarnings,
  resolveQueryFileSelector,
  requireGraphKey,
  resolveGraphQueryScope,
  resolveGraphTarget,
  resolveQuerySql,
  resolveStoreTarget,
  shouldUseJsonOutput,
} from "./shared.js";

export const queryLoadCommand = defineCommand({
  surface: "query.load",
  command: "fide query load",
  outputType: "QueryLoadOutput",
  summary: "Load query output from a graph",
  usage: [
    "fide query load --graph-key <key> <query> --to file:./rows.json",
    "fide query load --file .fide/graphs/<graph-key>/queries/<query>.sql --to file:./rows.json",
    "fide query load --graph-key <key> --stdin --to file:./rows.json",
  ],
  paramOrder: ["graph-key", "file", "stdin", "to", "pretty"],
  params: {
    "graph-key": { kind: "string", description: "Graph key for inline query input", valueLabel: "<key>" },
    file: { kind: "string", description: "Read query input from a saved query file path", valueLabel: "<query.sql>" },
    stdin: { kind: "boolean", description: "Read query input from stdin" },
    to: { kind: "string", required: true, description: "Load destination selector", valueLabel: "<type:value>" },
    pretty: { kind: "boolean", shorthand: "-p", description: "Human-readable output" },
  },
  examples: [
    "fide query load --graph-key primary 'select * from statements limit 10' --to file:./rows.json",
    "fide query load --graph-key primary 'select * from statements limit 10' --to file:./rows.jsonl",
    "fide query load --graph-key primary 'select * from statements limit 10' --to file:./rows.csv",
    "fide query load --file .fide/graphs/primary/queries/recentStatements.sql --to file:./rows.json",
  ],
  notes: [
    "Saved-query execution resolves from local query files under `.fide/graphs/<graphKey>/queries/`.",
    "Use `--to <type:value>` to select the load destination. `file:<path>` is supported now; `graph:<graphKey>` is reserved for a later materialized-load path.",
    "File output format is inferred from the destination extension: `.json`, `.jsonl`, or `.csv`. Unknown or missing extensions default to JSON.",
  ],
});

const QUERY_LOAD_PARSE_KEYS = mergeBooleanKeySets(booleanKeysFromCommand(queryLoadCommand));
const QUERY_LOAD_SCOPE = "graph-query-load-local.v1";

export type QueryLoadOutput = {
  ok: true;
  scope: typeof QUERY_LOAD_SCOPE;
  command: "fide query load";
  targetScope: "local";
  destination: string;
  graphKey: string;
  rowCount: number;
  outPath?: string;
  warnings: string[];
};

type QueryLoadFileFormat = "json" | "jsonl" | "csv";

function inferQueryLoadFileFormat(path: string): QueryLoadFileFormat {
  const extension = extname(path).toLowerCase();
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

function formatQueryLoadFileContent(
  format: QueryLoadFileFormat,
  rows: unknown[],
): string {
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

function buildFideId(typeChar: string, referenceChar: string, fingerprint: string): `did:fide:0x${string}` {
  return `did:fide:0x${typeChar}${referenceChar}${fingerprint}`;
}

function toGraphStatementWires(
  rows: Array<{
    subject_type: string;
    subject_reference_type: string;
    subject_fingerprint: string;
    predicate_fingerprint: string;
    object_type: string;
    object_reference_type: string;
    object_fingerprint: string;
    subject_reference_identifier: string;
    predicate_reference_identifier: string;
    object_reference_identifier: string;
  }>,
): GraphStatementWire[] {
  return rows.map((row) => ({
    s: buildFideId(row.subject_type, row.subject_reference_type, row.subject_fingerprint),
    sr: row.subject_reference_identifier,
    p: buildFideId("31", "20", row.predicate_fingerprint),
    pr: row.predicate_reference_identifier,
    o: buildFideId(row.object_type, row.object_reference_type, row.object_fingerprint),
    or: row.object_reference_identifier,
  }));
}

export async function runQueryLoad(args: string[]): Promise<number> {
  const initialParsed = parseArgs(args, { booleanKeys: QUERY_LOAD_PARSE_KEYS });
  if (initialParsed.flags.has("help") || initialParsed.flags.has("-h")) {
    console.log(renderCommandHelp(queryLoadCommand));
    return 0;
  }

  const flags = initialParsed.flags;
  await resolveGraphQueryScope(flags);
  const localTarget = resolveGraphTarget(flags);
  const filePath = typeof flags.get("file") === "string" ? String(flags.get("file")) : null;
  const toRaw = typeof flags.get("to") === "string" ? String(flags.get("to")) : null;
  if (!toRaw) {
    throw new Error("Missing required flag: --to <type:value>.");
  }
  const destination = parseTransportSelector(toRaw, { flagName: "--to", allowedTypes: ["file", "graph"] });
  const graphKey = filePath
    ? resolveQueryFileSelector(localTarget.root, filePath).graphKey
    : requireGraphKey(flags);
  const { parsed: resolvedParsed, sql } = await resolveQuerySql(args);
  if (!sql.trim()) {
    console.error("Missing query text for `fide query load`. Use `--stdin`, `--file <path>`, or pass the query inline.");
    console.error(renderCommandHelp(queryLoadCommand));
    return 1;
  }
  const target = assertLocalQueryableStore(
    graphKey,
    resolveStoreTarget(new Map<string, string | boolean>([["graph", graphKey]])),
    flags,
  );
  if (destination.type === "graph") {
    throw new Error("`fide query load --to graph:<graph-key>` is not implemented yet. Use `--to file:<path>` for now.");
  }

  const fileFormat = inferQueryLoadFileFormat(destination.value);
  const fideDir = resolve(localTarget.root, ".fide");
  const outPath = resolveTransportFilePath(fideDir, destination.value);
  let rowCount = 0;

  if (fileFormat === "jsonl") {
    if (target.type !== "sqlite") {
      throw new Error("`fide query load --to file:*.jsonl` currently supports sqlite statement queries only.");
    }
    try {
      const resolvedRows = await querySqliteResolvedStatements(target.file, sql);
      const statementWires = toGraphStatementWires(resolvedRows);
      rowCount = statementWires.length;
      await writeUtf8(outPath, formatGraphStatementBatchJsonl(statementWires));
    } catch {
      throw createCliStructuredError(
        "`fide query load --to file:*.jsonl` expects a statement-shaped sqlite query selecting from `statements` rows.",
        {
          hint: "Use a query like `select * from statements ...` when exporting statement JSONL. For aggregate or arbitrary row output, use `.json` or `.csv` instead.",
        },
      );
    }
  } else {
    const result = await executeGraphQuery({
      target,
      sql,
    });
    rowCount = result.rowCount;
    await writeUtf8(outPath, formatQueryLoadFileContent(fileFormat, result.rows));
  }

  const payload: QueryLoadOutput = {
    ok: true,
    scope: QUERY_LOAD_SCOPE,
    command: "fide query load",
    targetScope: "local",
    destination: toRaw,
    graphKey,
    rowCount,
    outPath,
    warnings: getLocalFideWarnings(localTarget.root, { gitignore: localTarget.gitignore }),
  };
  if (shouldUseJsonOutput(resolvedParsed.flags)) {
    printJson(payload);
  } else {
    console.log(formatPretty(QUERY_LOAD_SCOPE, payload));
  }
  return 0;
}
