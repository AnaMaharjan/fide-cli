import { commandSchema, defineCommand } from "../../util/command-metadata.js";

export const graphDraftCommand = defineCommand({
  surface: "graph.draft",
  command: "fide graph draft",
  summary: "Create a markdown statement draft in a local .fide directory",
  usage: [
    "fide graph draft [--fide-dir <path>] --name <draft-name> <json>",
    "fide graph draft [--fide-dir <path>] --name <draft-name> --file <inputs> [--format <json|jsonl|fsd>]",
    "fide graph draft [--fide-dir <path>] --name <draft-name> --stdin [--format <json|jsonl|fsd>]",
  ],
  params: [
    { name: "fide-dir", type: "string", description: "Local .fide directory override", valueLabel: "<path>" },
    { name: "name", type: "string", required: true, description: "Draft file name without .md", valueLabel: "<draft-name>" },
    { name: "path", type: "string", description: "Optional subdirectory under .fide/drafts/statements", valueLabel: "<draft-path>" },
    { name: "description", type: "string", description: "Optional draft description frontmatter", valueLabel: "<text>" },
    { name: "file", type: "string", description: "Read statement inputs from a file", valueLabel: "<inputs>" },
    { name: "stdin", type: "boolean", description: "Read statement inputs from stdin" },
    { name: "format", type: "string", enum: ["json", "jsonl", "fsd"], description: "Force input format" },
    { name: "no-normalize", type: "boolean", description: "Disable reference identifier normalization" },
    { name: "pretty", type: "boolean", shorthand: "-p", description: "Human-readable output" },
  ],
  output: {
    name: "string",
    root: "string",
    statementCount: "number",
    mode: "string",
    outPath: "string",
    createdAtUTC: "string",
    updatedAtUTC: "string",
    updateCount: "number",
    next: "object",
    warnings: "string[]",
  },
  notes: [
    "Creates or updates a markdown statement draft for local editing.",
    "Writes to .fide/drafts/statements/<draft-path>/<draft-name>.md.",
    "Reusing the same --name and --path updates the existing draft metadata and content.",
    "Use --path to organize drafts by feature, workflow, or topic.",
    "Draft statement lines are labeled @1, @2, ... for local statement references.",
    "Use [Statement/Statement:@2] or [Statement/Statement:relative/path.md@2] to refer to earlier draft statements.",
    "Draft inputs are validated before write and will be validated again when later built into a statement store.",
    "Use `fide graph write` for canonical JSONL statement batches.",
  ],
});

export const graphStatusCommand = defineCommand({
  surface: "graph.status",
  command: "fide graph status",
  summary: "Inspect local graph state and configured runtime status",
  usage: [
    "fide graph status",
    "fide graph status --fide-dir <path>",
    "fide graph status --statement-store <name>",
    "fide graph status --query-store <name>",
  ],
  params: [
    { name: "fide-dir", type: "string", description: "Optional local .fide directory override", valueLabel: "<path>" },
    { name: "statement-store", type: "string", description: "Configured statement store name", valueLabel: "<name>" },
    { name: "query-store", type: "string", description: "Configured query store name", valueLabel: "<name>" },
  ],
  output: {
    ok: "boolean",
    local: "object?",
    statementStore: "object?",
    queryStore: "object?",
    statementStores: "array<{ key: string, storeType: string, warnings?: string[], next?: object }>?",
    queryStores: "array<{ key: string, storeType: string, next?: object }>?",
    next: "object?",
  },
  notes: [
    "With no selector, returns local .fide status plus configured statement-store and query-store summaries.",
    "Use `--statement-store <name>` for one configured statement store.",
    "Use `--query-store <name>` for one configured query store.",
  ],
});

export const graphSqlCommand = defineCommand({
  surface: "graph.sql",
  command: "fide graph sql",
  summary: "Run SQL against a configured sqlite or postgres statement store",
  usage: [
    "fide graph sql --statement-store <name> <sql>",
    "fide graph sql --statement-store <name> --file <query.sql>",
    "fide graph sql --statement-store <name> --stdin",
  ],
  params: [
    { name: "statement-store", type: "string", required: true, description: "Configured sqlite or postgres statement store name", valueLabel: "<name>" },
    { name: "file", type: "string", description: "Read SQL from a file", valueLabel: "<query.sql>" },
    { name: "stdin", type: "boolean", description: "Read SQL from stdin" },
    { name: "allow-write", type: "boolean", description: "Allow write SQL" },
    { name: "pretty", type: "boolean", shorthand: "-p", description: "Human-readable output" },
  ],
  output: {
    ok: "boolean",
    storeType: "string",
    key: "string?",
    file: "string?",
    schema: "string?",
    rowCount: "number",
    rows: "array",
    warnings: "string[]?",
  },
  examples: [
    "fide graph sql --statement-store primary 'select * from statements limit 10'",
    "fide graph sql --statement-store sqlite 'select * from statements limit 10'",
    "fide graph sql --statement-store primary --file queries/statements.sql",
  ],
  notes: [
    "`fide graph sql` is for ad hoc SQL against built statement stores.",
    "Author statements and saved queries locally with `fide graph write`, then use `fide graph build` to push them into stores.",
  ],
});

export const graphBuildCommand = defineCommand({
  surface: "graph.build",
  command: "fide graph build",
  summary: "Build configured statement or query stores from graph sources",
  usage: [
    "fide graph build --statements <name>",
    "fide graph build --queries <name>",
  ],
  params: [
    { name: "statements", type: "string", description: "Configured statement store name with a recipe", valueLabel: "<name>" },
    { name: "queries", type: "string", description: "Configured query store name", valueLabel: "<name>" },
    { name: "pretty", type: "boolean", shorthand: "-p", description: "Human-readable output" },
  ],
  output: {
    ok: "boolean",
    storeType: "string",
    key: "string?",
    file: "string?",
    schema: "string?",
    statementCount: "number",
    queryCount: "number?",
    steps: "array<{ from: string, statementCount: number }>",
    lastRunAt: "string",
    warnings: "string[]?",
  },
  examples: [
    "fide graph build --statements sqlite",
    "fide graph build --statements combined",
    "fide graph build --queries postgresQueries",
  ],
  notes: [
    "Recipe SQL may include $lastRunAt for incremental runs.",
    "On the first run, $lastRunAt resolves to 1970-01-01T00:00:00.000Z.",
    "Local fide-jsonl recipe steps may use fromDateUTC/toDateUTC; these apply at UTC date granularity based on .fide/statements/YYYY/MM/DD folders.",
    "Query-store builds load local .fide/queries/<statement-store>/<name>.sql files.",
  ],
});

export const GRAPH_COMMAND_METADATA = [
  graphDraftCommand,
  graphStatusCommand,
  graphSqlCommand,
  graphBuildCommand,
] as const;

export const GRAPH_COMMAND_SCHEMAS = Object.fromEntries(
  GRAPH_COMMAND_METADATA.map((command) => [command.surface, commandSchema(command)]),
);
