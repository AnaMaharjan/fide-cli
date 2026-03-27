import { executeGraphQuery } from "@chris-test/graph-db";
import { parseArgs } from "../../util/command/args.js";
import {
  booleanKeysFromCommand,
  defineCommand,
  mergeBooleanKeySets,
  renderCommandHelp,
} from "../../util/command/command-metadata.js";
import { printJson } from "../../util/command/io.js";
import { formatPretty } from "../../util/command/pretty.js";
import {
  assertLocalQueryableStore,
  getLocalFideWarnings,
  resolveQueryFileSelector,
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
    "fide query run --graph-key <key> <query>",
    "fide query run --file .fide/graphs/<graph-key>/queries/<query>.sql",
    "fide query run --graph-key <key> --stdin",
  ],
  paramOrder: ["graph-key", "file", "stdin", "pretty"],
  params: {
    "graph-key": { kind: "string", description: "Graph key for inline query input", valueLabel: "<key>" },
    file: { kind: "string", description: "Read query input from a saved query file path", valueLabel: "<query.sql>" },
    stdin: { kind: "boolean", description: "Read query input from stdin" },
    pretty: { kind: "boolean", shorthand: "-p", description: "Human-readable output" },
  },
  examples: [
    "fide query run --graph-key primary 'select * from statements limit 10'",
    "fide query run --file .fide/graphs/primary/queries/recentStatements.sql",
  ],
  notes: [
    "Saved-query execution resolves from local query files under `.fide/graphs/<graphKey>/queries/`.",
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
  await resolveGraphQueryScope(flags);
  const localTarget = resolveGraphTarget(flags);
  const filePath = typeof flags.get("file") === "string" ? String(flags.get("file")) : null;
  const graphKey = filePath
    ? resolveQueryFileSelector(localTarget.root, filePath).graphKey
    : requireGraphKey(flags);
  const { parsed: resolvedParsed, sql } = await resolveQuerySql(args);
  if (!sql.trim()) {
    console.error("Missing query text for `fide query run`. Use `--stdin`, `--file <path>`, or pass the query inline.");
    console.error(renderCommandHelp(queryRunCommand));
    return 1;
  }
  const target = assertLocalQueryableStore(
    graphKey,
    resolveStoreTarget(new Map<string, string | boolean>([["graph", graphKey]])),
    flags,
  );
  const result = await executeGraphQuery({
    target,
    sql,
  });
  const payload = {
    targetScope: "local",
    ...result,
    ...("file" in result ? { warnings: getLocalFideWarnings(localTarget.root, { gitignore: localTarget.gitignore }) } : {}),
  };
  if (shouldUseJsonOutput(resolvedParsed.flags)) {
    printJson(payload);
  } else {
    console.log(formatPretty("graph-query-run-local.v1", payload));
  }
  return 0;
}
