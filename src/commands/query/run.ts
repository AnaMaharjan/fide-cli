import { executeGraphQuery } from "@chris-test/graph-db";
import { parseArgs } from "../../util/command/args.js";
import {
  booleanKeysFromCommand,
  defineCommand,
  mergeBooleanKeySets,
  readCommandNumberFlag,
  renderCommandHelp,
} from "../../util/command/command-metadata.js";
import { printJson } from "../../util/command/io.js";
import { formatPretty } from "../../util/command/pretty.js";
import {
  assertLocalQueryableStore,
  getLocalFideWarnings,
  readProjectQueryOrThrow,
  requireGraphKey,
  resolveGraphQueryScope,
  resolveGraphTarget,
  resolveQuerySql,
  resolveStoreTarget,
  shouldUseJsonOutput,
} from "./shared.js";

export const queryRunCommand = defineCommand({
  surface: "query.run",
  command: "fide query run",
  outputType: "QueryRunOutput",
  summary: "Run ad hoc SQL or execute a saved query",
  usage: [
    "fide query run --graph <key> <query>",
    "fide query run --graph <key> --file <query.sql>",
    "fide query run --graph <key> --stdin",
    "fide query run --graph <key> --name <query-name>",
  ],
  paramOrder: ["graph", "name", "limit", "file", "stdin", "allow-write", "pretty"],
  params: {
    graph: { kind: "string", required: true, description: "Graph key", valueLabel: "<key>" },
    name: { kind: "string", description: "Saved query name instead of ad hoc SQL", valueLabel: "<query-name>" },
    limit: { kind: "number", description: "Maximum row count for hosted saved-query execution", valueLabel: "<n>" },
    file: { kind: "string", description: "Read SQL from a file", valueLabel: "<query.sql>" },
    stdin: { kind: "boolean", description: "Read SQL from stdin" },
    "allow-write": { kind: "boolean", description: "Allow write SQL for ad hoc local execution" },
    pretty: { kind: "boolean", shorthand: "-p", description: "Human-readable output" },
  },
  examples: [
    "fide query run --graph primary 'select * from statements limit 10'",
    "fide query run --graph primary --name recentStatements",
  ],
  notes: [
    "Saved-query execution resolves against local project queries.",
  ],
});

const QUERY_RUN_PARSE_KEYS = mergeBooleanKeySets(booleanKeysFromCommand(queryRunCommand));

export type QueryRunOutput = {
  targetScope: "local";
  warnings?: string[];
  [key: string]: unknown;
};

export async function runQueryRun(args: string[]): Promise<number> {
  const initialParsed = parseArgs(args, { booleanKeys: QUERY_RUN_PARSE_KEYS });
  if (initialParsed.flags.has("help") || initialParsed.flags.has("-h")) {
    console.log(renderCommandHelp(queryRunCommand));
    return 0;
  }

  const flags = initialParsed.flags;
  const name = flags.get("name");
  if (typeof name !== "string" || !name) {
    const { parsed, sql } = await resolveQuerySql(args);
    const resolvedFlags = parsed.flags;
    const graphKey = requireGraphKey(resolvedFlags);
    if (!sql.trim()) {
      console.error("Missing query text for `fide query run`. Use `--stdin`, `--file <path>`, or pass the query inline.");
      console.error(renderCommandHelp(queryRunCommand));
      return 1;
    }
    const target = assertLocalQueryableStore(
      graphKey,
      resolveStoreTarget(new Map<string, string | boolean>([["graph", graphKey]])),
      resolvedFlags,
    );
    const result = await executeGraphQuery({
      target,
      sql,
      allowWrite: resolvedFlags.has("allow-write"),
    });
    const localTarget = resolveGraphTarget(resolvedFlags);
    const payload = {
      targetScope: "local",
      ...result,
      ...("file" in result ? { warnings: getLocalFideWarnings(localTarget.root, { gitignore: localTarget.gitignore }) } : {}),
    };
    if (shouldUseJsonOutput(resolvedFlags)) {
      printJson(payload);
    } else {
      console.log(formatPretty("graph-query-run-local.v1", payload));
    }
    return 0;
  }

  const parsed = parseArgs(args, { booleanKeys: QUERY_RUN_PARSE_KEYS });
  const graphKey = requireGraphKey(parsed.flags);
  const limitParsed = readCommandNumberFlag(queryRunCommand, parsed, "limit");
  const limit = limitParsed;
  if (limit !== undefined && (!Number.isInteger(limit) || limit <= 0)) {
    throw new Error("Invalid --limit value. Expected a positive integer.");
  }

  await resolveGraphQueryScope(parsed.flags);
  void limit;

  const { query } = await readProjectQueryOrThrow(parsed.flags);
  const target = assertLocalQueryableStore(
    graphKey,
    resolveStoreTarget(new Map<string, string | boolean>([["graph", graphKey]])),
    parsed.flags,
  );
  const result = await executeGraphQuery({
    target,
    sql: query.sql,
    allowWrite: parsed.flags.has("allow-write"),
  });
  const localTarget = resolveGraphTarget(parsed.flags);
  const payload = {
    targetScope: "local",
    ...result,
    ...("file" in result ? { warnings: getLocalFideWarnings(localTarget.root, { gitignore: localTarget.gitignore }) } : {}),
  };
  if (shouldUseJsonOutput(parsed.flags)) {
    printJson(payload);
  } else {
    console.log(formatPretty("graph-query-run-local.v1", payload));
  }
  return 0;
}
