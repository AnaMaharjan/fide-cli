import { commandSchemas, defineCommand } from "../../util/command/command-metadata.js";
import { querySaveCommand } from "./save.js";

export const queryRunCommand = defineCommand({
  surface: "query.run",
  command: "fide query run",
  summary: "Run ad hoc SQL or execute a saved query",
  usage: [
    "fide query run --graph <key> <query>",
    "fide query run --graph <key> --file <query.sql>",
    "fide query run --graph <key> --stdin",
    "fide query run --graph <key> --name <query-name>",
  ],
  params: [
    { name: "graph", type: "string", required: true, description: "Graph key", valueLabel: "<key>" },
    { name: "name", type: "string", description: "Saved query name instead of ad hoc SQL", valueLabel: "<query-name>" },
    { name: "limit", type: "number", description: "Maximum row count for hosted saved-query execution", valueLabel: "<n>" },
    { name: "file", type: "string", description: "Read SQL from a file", valueLabel: "<query.sql>" },
    { name: "stdin", type: "boolean", description: "Read SQL from stdin" },
    { name: "allow-write", type: "boolean", description: "Allow write SQL for ad hoc local execution" },
    { name: "pretty", type: "boolean", shorthand: "-p", description: "Human-readable output" },
  ],
  output: {
    targetScope: "string?",
    ok: "boolean?",
    graphStoreType: "string?",
    key: "string?",
    file: "string?",
    schema: "string?",
    rowCount: "number",
    rows: "array",
    warnings: "string[]?",
  },
  examples: [
    "fide query run --graph primary 'select * from statements limit 10'",
    "fide query run --graph primary --name recentStatements",
  ],
  notes: [
    "Saved-query execution resolves against local project queries.",
  ],
});

export const queryListCommand = defineCommand({
  surface: "query.list",
  command: "fide query list",
  summary: "List local project query summaries",
  usage: [
    "fide query list",
    "fide query list --graph <key>",
  ],
  params: [
    { name: "graph", type: "string", description: "Optional graph key filter", valueLabel: "<key>" },
    { name: "fide-dir", type: "string", description: "Local .fide directory override", valueLabel: "<path>" },
    { name: "pretty", type: "boolean", shorthand: "-p", description: "Human-readable output" },
  ],
  output: {
    targetScope: "string",
    root: "string",
    queries: "array",
  },
  examples: [
    "fide query list",
    "fide query list --graph primary",
  ],
  notes: [
    "Lists query definitions from the current project's `.fide/queries/` directory.",
    "The query list is local-first source of truth and does not read hosted state.",
    "Use `fide query get --graph <key> --name <query-name>` to read the full query text for a selected result.",
  ],
});

export const queryGetCommand = defineCommand({
  surface: "query.get",
  command: "fide query get",
  summary: "Read one local project query",
  usage: [
    "fide query get --graph <key> --name <query-name>",
  ],
  params: [
    { name: "graph", type: "string", required: true, description: "Graph key", valueLabel: "<key>" },
    { name: "name", type: "string", required: true, description: "Saved query name", valueLabel: "<query-name>" },
    { name: "fide-dir", type: "string", description: "Local .fide directory override", valueLabel: "<path>" },
    { name: "pretty", type: "boolean", shorthand: "-p", description: "Human-readable output" },
  ],
  output: {
    targetScope: "string",
    root: "string?",
    baseUrl: "string?",
    source: "string?",
    workspaceId: "string?",
    workspaceSelectionSource: "string?",
    query: "object",
    next: "object?",
  },
  examples: [
    "fide query get --graph primary --name recentStatements",
  ],
  notes: [
    "Reads the local project query definition from `.fide/queries/`.",
    "Use `fide query list` first when you need to discover the available graph/name pairs.",
  ],
});

export const queryCommand = defineCommand({
  surface: "query",
  command: "fide query",
  summary: "Query local project data and saved query definitions",
  usage: [
    "fide query <command> [flags]",
  ],
  params: [],
  output: {},
});

export const QUERY_COMMAND_METADATA = [queryCommand, queryRunCommand, queryListCommand, queryGetCommand, querySaveCommand] as const;

export const QUERY_COMMAND_SCHEMAS = commandSchemas(QUERY_COMMAND_METADATA);
