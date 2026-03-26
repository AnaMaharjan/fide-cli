import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { hasFlag, parseArgs } from "../../util/command/args.js";
import {
  booleanKeysFromCommand,
  defineCommand,
  mergeBooleanKeySets,
  readCommandStringFlag,
  renderCommandHelp,
} from "../../util/command/command-metadata.js";
import { printJson, writeUtf8 } from "../../util/command/io.js";
import { formatPretty } from "../../util/command/pretty.js";
import {
  assertLocalQueryCommand,
  getLocalFideWarnings,
  readLocalQueries,
  renderLocalQueryFileWithDescriptionLine,
  resolveGraphTarget,
  resolveQueriesDir,
  resolveQuerySaveInput,
  shouldUseJsonOutput,
} from "./shared.js";

export const querySaveCommand = defineCommand({
  surface: "query.save",
  command: "fide query save",
  outputType: "QuerySaveOutput",
  summary: "Save a local project query",
  usage: [
    "fide query save --graph <key> --name <query-name> <query>",
    "fide query save --graph <key> --name <query-name> --file <query.sql>",
  ],
  paramOrder: ["graph", "name", "description", "fide-dir", "file", "stdin", "pretty"],
  params: {
    graph: { kind: "string", required: true, description: "Graph key targeted by this query", valueLabel: "<key>" },
    name: { kind: "string", required: true, description: "Saved query name", valueLabel: "<query-name>" },
    description: { kind: "string", description: "Optional query description", valueLabel: "<text>" },
    "fide-dir": { kind: "string", description: "Local .fide directory override", valueLabel: "<path>" },
    file: { kind: "string", description: "Read SQL from a file", valueLabel: "<query.sql>" },
    stdin: { kind: "boolean", description: "Read SQL from stdin" },
    pretty: { kind: "boolean", shorthand: "-p", description: "Human-readable output" },
  },
  examples: [
    "fide query save --graph primary --name recentStatements 'select * from statements limit 10'",
    "fide query save --graph primary --name recentStatements --description 'Recent statement sample'",
  ],
  notes: [
    "Saves into the current project's `.fide/queries/<graph>/` directory.",
    "If SQL is omitted and the query already exists, the existing SQL body is preserved so you can update metadata like `--description` only.",
    "Use `fide start` to sync the local query definition into the selected workspace.",
  ],
});

const QUERY_SAVE_PARSE_KEYS = mergeBooleanKeySets(booleanKeysFromCommand(querySaveCommand));

export type QuerySaveOutput = {
  ok: true;
  targetScope: "local";
  mode: "query";
  graphKey: string;
  name: string;
  outPath: string;
  warnings: string[];
};

function resolveQuerySaveDescriptionInput(
  parsed: ReturnType<typeof parseArgs>,
  fileDescription: string | null,
): { mode: "preserve" } | { mode: "set"; value: string | null } {
  const description = readCommandStringFlag(querySaveCommand, parsed, "description");
  if (description !== null) {
    return { mode: "set", value: description };
  }
  if (hasFlag(parsed.flags, "description")) {
    return { mode: "set", value: null };
  }
  if (fileDescription !== null) {
    return { mode: "set", value: fileDescription };
  }
  return { mode: "preserve" };
}

export async function runQuerySave(args: string[]): Promise<number> {
  const initialParsed = parseArgs(args, { booleanKeys: QUERY_SAVE_PARSE_KEYS });
  if (initialParsed.flags.has("help") || initialParsed.flags.has("-h")) {
    console.log(renderCommandHelp(querySaveCommand));
    return 0;
  }
  assertLocalQueryCommand(initialParsed.flags, "fide query save");

  const { parsed, sql, fileDescription } = await resolveQuerySaveInput(args);
  const flags = parsed.flags;
  const graphKey = readCommandStringFlag(querySaveCommand, parsed, "graph");
  const name = readCommandStringFlag(querySaveCommand, parsed, "name");
  const descriptionUpdate = resolveQuerySaveDescriptionInput(parsed, fileDescription);
  if (!graphKey || !name) {
    throw new Error("Query save command metadata failed to resolve required flags.");
  }

  const graphTarget = resolveGraphTarget(flags);
  if (graphTarget.type !== "local") {
    throw new Error("`fide query save` only supports project `.fide` directories.");
  }

  const existingQueries = await readLocalQueries(graphTarget.root);
  const existingQuery = existingQueries.find((entry) => entry.graphKey === graphKey && entry.name === name) ?? null;
  const resolvedSql = sql.trim() ? sql : existingQuery?.sql ?? "";
  const description = descriptionUpdate.mode === "set"
    ? descriptionUpdate.value
    : existingQuery?.description ?? null;
  if (!resolvedSql.trim()) {
    console.error("Missing SQL for `fide query save`. Use `--stdin`, `--file <path>`, pass SQL inline, or target an existing saved query.");
    console.error(renderCommandHelp(querySaveCommand));
    return 1;
  }

  const outPath = resolve(resolveQueriesDir(graphTarget.root), graphKey, `${name}.sql`);
  await mkdir(resolve(outPath, ".."), { recursive: true });
  await writeUtf8(outPath, renderLocalQueryFileWithDescriptionLine(
    resolvedSql,
    description ?? null,
  ));

  const payload: QuerySaveOutput = {
    ok: true,
    targetScope: "local",
    mode: "query",
    graphKey,
    name,
    outPath,
    warnings: getLocalFideWarnings(graphTarget.root, { gitignore: graphTarget.gitignore }),
  };
  if (shouldUseJsonOutput(flags)) {
    printJson(payload);
  } else {
    console.log(formatPretty("graph-query-save-local.v1", payload));
  }
  return 0;
}
