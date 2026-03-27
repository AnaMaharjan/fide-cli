import { readdir, readFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { mkdir } from "node:fs/promises";
import { type Statement, parseGraphStatementBatchJsonl, resolveGraphTarget, resolveStoreTarget } from "@chris-test/graph";
import { createDbBundle, ensureSqliteGraphSchema, ingestStatementsToSqlite, ingestStatementsWithDb } from "@chris-test/graph-db";
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
import { getLocalFideWarnings } from "../query/shared.js";

export const statementsLoadCommand = defineCommand({
  surface: "statements.load",
  command: "fide statements load",
  outputType: "StatementsLoadOutput",
  summary: "Load local statements into a graph",
  usage: [
    "fide statements load --graph-key <graph-key>",
    "fide statements load --graph-key <graph-key> --from-date 2026-03-01 --to-date 2026-03-31",
  ],
  paramOrder: ["graph-key", "from-date", "to-date", "pretty"],
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
    pretty: { kind: "boolean", shorthand: "-p", description: "Human-readable output" },
  },
  examples: [
    "fide statements load --graph-key primary",
    "fide statements load --graph-key primary --from-date 2026-03-01 --to-date 2026-03-31",
  ],
  notes: [
    "Loads canonical local statements from this project's `.fide/statements/` into the target graph.",
    "Date filters are inclusive and apply to the dated local statement batch layout.",
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
  fileCount: number;
  statementCount: number;
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

function extractBatchDate(statementsDir: string, file: string): string | null {
  const rel = relative(statementsDir, file).replaceAll("\\", "/");
  const match = /^(\d{4})\/(\d{2})\/(\d{2})\//.exec(rel);
  if (!match) return null;
  return `${match[1]}-${match[2]}-${match[3]}`;
}

async function listStatementBatchFiles(statementsDir: string): Promise<string[]> {
  const entries = await readdir(statementsDir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = join(statementsDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listStatementBatchFiles(fullPath));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".jsonl")) {
      files.push(fullPath);
    }
  }
  return files.sort();
}

async function readCanonicalStatements(
  statementsDir: string,
  options: { fromDate?: string; toDate?: string },
): Promise<{ files: string[]; statements: Statement[] }> {
  const allFiles = await listStatementBatchFiles(statementsDir);
  const filteredFiles = allFiles.filter((file) => {
    const batchDate = extractBatchDate(statementsDir, file);
    if (options.fromDate && batchDate && batchDate < options.fromDate) return false;
    if (options.toDate && batchDate && batchDate > options.toDate) return false;
    return true;
  });

  const statementsById = new Map<string, Statement>();
  for (const file of filteredFiles) {
    const raw = await readFile(file, "utf8");
    const parsed = await parseGraphStatementBatchJsonl(raw);
    for (const statement of parsed.statements) {
      if (!statement.statementFideId) {
        throw new Error(`Invalid local statement batch: missing statementFideId in ${file}`);
      }
      statementsById.set(statement.statementFideId, statement);
    }
  }

  return {
    files: filteredFiles,
    statements: Array.from(statementsById.values()),
  };
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
  if (!graphKey) {
    throw new Error("Missing required flag: --graph-key <graph-key>.");
  }
  if (fromDate && toDate && fromDate > toDate) {
    throw new Error("`--from-date` must be on or before `--to-date`.");
  }

  const graphTarget = resolveGraphTarget(parsed.flags);
  const statementsDir = resolve(graphTarget.root, ".fide", "statements");
  const { files, statements } = await readCanonicalStatements(statementsDir, { fromDate, toDate });
  const target = resolveStoreTarget(new Map<string, string | boolean>([["graph", graphKey]]));

  if (target.type === "fide-jsonl") {
    throw new Error("`fide statements load` only supports sqlite and postgres graphs.");
  }

  let statementCount = 0;
  if (target.type === "sqlite") {
    await mkdir(dirname(target.file), { recursive: true });
    await ensureSqliteGraphSchema(target.file);
    statementCount = await ingestStatementsToSqlite(target.file, statements);
  } else {
    if (!target.databaseUrl) {
      throw new Error(
        `Missing postgres connection for graph "${graphKey}". Configure connection.url in .fide/graphs/${graphKey}/config.json or set the referenced env var.`,
      );
    }
    const bundle = createDbBundle(target.databaseUrl, { searchPath: target.schema });
    try {
      const result = await ingestStatementsWithDb(bundle.db, { statements });
      statementCount = result.statementCount;
    } finally {
      await bundle.client.end({ timeout: 1 });
    }
  }

  const payload: StatementsLoadOutput = {
    ok: true,
    scope: STATEMENTS_LOAD_SCOPE,
    command: "fide statements load",
    graphKey,
    graphStoreType: target.type,
    statementsDir,
    fileCount: files.length,
    statementCount,
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
