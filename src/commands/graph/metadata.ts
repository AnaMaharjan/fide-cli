import { commandSchemas, defineCommand } from "../../util/command-metadata.js";

export const graphWriteCommand = defineCommand({
  surface: "graph.statements.write",
  command: "fide graph statements write",
  summary: "Write canonical statement batches into a local project graph",
  usage: [
    "fide graph statements write [--fide-dir <path>] <json>",
    "fide graph statements write [--fide-dir <path>] --file <inputs> [--format <json|jsonl|fsd>]",
    "fide graph statements write [--fide-dir <path>] --stdin [--format <json|jsonl|fsd>]",
  ],
  params: [
    { name: "fide-dir", type: "string", description: "Local .fide directory override", valueLabel: "<path>" },
    { name: "file", type: "string", description: "Read statement inputs from a file", valueLabel: "<inputs>" },
    { name: "stdin", type: "boolean", description: "Read statement inputs from stdin" },
    { name: "format", type: "string", enum: ["json", "jsonl", "fsd"], description: "Force input format" },
    { name: "no-normalize", type: "boolean", description: "Disable reference identifier normalization" },
    { name: "pretty", type: "boolean", shorthand: "-p", description: "Human-readable output" },
  ],
  output: {
    root: "string",
    statementCount: "number",
    mode: "string",
    outPath: "string",
    warnings: "string[]",
  },
  notes: [
    "Writes JSONL batches under .fide/statements/YYYY/MM/DD/<root>.jsonl.",
    "`fide graph statements write` only writes statement batches to a local .fide directory.",
    "Use `fide graph query save` to save project query definitions.",
  ],
});

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
    "Draft inputs are validated before write and will be validated again when later built into a graph.",
    "Use `fide graph statements write` for canonical JSONL statement batches.",
  ],
});

export const graphDefsCommand = defineCommand({
  surface: "graph.defs",
  command: "fide graph defs",
  summary: "Inspect Fide entity definitions and statement rules",
  usage: [
    "fide graph defs [--entity <EntityType>]",
    "fide graph defs <EntityType>",
  ],
  params: [
    { name: "entity", type: "string", description: "Optional entity type filter", valueLabel: "<EntityType>" },
  ],
  output: {
    ok: "boolean",
    command: "string",
    scope: "string",
    layers: "object",
    statementRules: "array",
    entity: "object?",
    entities: "array?",
  },
  examples: [
    "fide graph defs",
    "fide graph defs --entity NetworkResource",
    "fide graph defs Person",
  ],
});

export const graphStatusCommand = defineCommand({
  surface: "graph.status",
  command: "fide graph status",
  summary: "Inspect local graph state and configured runtime status",
  usage: [
    "fide graph status",
    "fide graph status --fide-dir <path>",
    "fide graph status --graph <name>",
    "fide graph status --query-store <name>",
  ],
  params: [
    { name: "fide-dir", type: "string", description: "Optional local .fide directory override", valueLabel: "<path>" },
    { name: "graph", type: "string", description: "Configured graph key", valueLabel: "<name>" },
    { name: "query-store", type: "string", description: "Configured query store name", valueLabel: "<name>" },
  ],
  output: {
    ok: "boolean",
    local: "object?",
    graph: "object?",
    queryStore: "object?",
    graphs: "array<{ key: string, storeType: string, warnings?: string[], next?: object }>?",
    queryStores: "array<{ key: string, storeType: string, next?: object }>?",
    next: "object?",
  },
  notes: [
    "With no selector, returns local .fide status plus configured graph and query-store summaries.",
    "Use `--graph <name>` for one configured graph.",
    "Use `--query-store <name>` for one configured query store.",
  ],
});

export const graphListCommand = defineCommand({
  surface: "graph.list",
  command: "fide graph list",
  summary: "List hosted graphs for a workspace",
  usage: [
    "fide graph list --workspace <workspace-id>",
  ],
  params: [
    { name: "workspace", type: "string", required: true, description: "Workspace id", valueLabel: "<workspace-id>" },
    { name: "pretty", type: "boolean", shorthand: "-p", description: "Human-readable output" },
  ],
  output: {
    baseUrl: "string",
    source: "string",
    workspaceId: "string",
    workspaceSelectionSource: "string",
    graphs: "array",
  },
  examples: [
    "fide graph list --workspace <workspace-id>",
  ],
});

export const graphGetCommand = defineCommand({
  surface: "graph.get",
  command: "fide graph get",
  summary: "Inspect one hosted graph for a workspace",
  usage: [
    "fide graph get --workspace <workspace-id> --graph <name>",
  ],
  params: [
    { name: "workspace", type: "string", required: true, description: "Workspace id", valueLabel: "<workspace-id>" },
    { name: "graph", type: "string", required: true, description: "Hosted graph key", valueLabel: "<name>" },
    { name: "pretty", type: "boolean", shorthand: "-p", description: "Human-readable output" },
  ],
  output: {
    baseUrl: "string",
    source: "string",
    workspaceId: "string",
    workspaceSelectionSource: "string",
    graph: "object",
  },
  examples: [
    "fide graph get --workspace <workspace-id> --graph primary",
  ],
});

export const graphSaveCommand = defineCommand({
  surface: "graph.save",
  command: "fide graph save",
  summary: "Save hosted graph configuration",
  usage: [
    "fide graph save --workspace <workspace-id> --graph <name> --type postgres --schema <schema> --connection-ref <ref>",
    "fide graph save --workspace <workspace-id> --graph <name> --type postgres --schema <schema> --connection <postgres-url>",
    "fide graph save --workspace <workspace-id> --graph <name> --type sqlite --connection <path>",
    "fide graph save --workspace <workspace-id> --graph <name> --stdin",
  ],
  params: [
    { name: "workspace", type: "string", required: true, description: "Workspace id", valueLabel: "<workspace-id>" },
    { name: "graph", type: "string", required: true, description: "Hosted graph key", valueLabel: "<name>" },
    { name: "type", type: "string", enum: ["postgres", "sqlite", "fide-jsonl"], description: "Hosted graph store type" },
    { name: "schema", type: "string", description: "Postgres schema for postgres-backed graphs", valueLabel: "<schema>" },
    { name: "connection", type: "string", description: "Direct connection string or path", valueLabel: "<value>" },
    { name: "connection-ref", type: "string", description: "Workspace-managed connection reference", valueLabel: "<ref>" },
    { name: "gitignore", type: "boolean", description: "Mark sqlite graph files for gitignore handling" },
    { name: "recipe-file", type: "string", description: "JSON file containing graph recipe steps", valueLabel: "<recipe.json>" },
    { name: "file", type: "string", description: "Read the full graph config object from a file", valueLabel: "<graph.json>" },
    { name: "stdin", type: "boolean", description: "Read the full graph config object from stdin" },
    { name: "pretty", type: "boolean", shorthand: "-p", description: "Human-readable output" },
  ],
  output: {
    baseUrl: "string",
    source: "string",
    workspaceId: "string",
    workspaceSelectionSource: "string",
    graphKey: "string",
    graph: "object",
    settings: "object",
  },
  examples: [
    "fide graph save --workspace <workspace-id> --graph primary --type postgres --schema fide_graph --connection-ref primary-graph",
    "fide graph save --workspace <workspace-id> --graph local-mirror --type sqlite --connection ./tmp/fide.db",
  ],
  notes: [
    "This command updates `workspace.settings.graphs`.",
    "Pass `--file` or `--stdin` to provide the full graph config object instead of individual flags.",
  ],
});

export const graphQueryCommand = defineCommand({
  surface: "graph.query",
  command: "fide graph query",
  summary: "Run, inspect, and save graph queries",
  usage: [
    "fide graph query <command> [flags]",
  ],
  params: [],
  output: {},
  notes: [
    "Use `run` for ad hoc SQL or saved-query execution.",
    "Use `--workspace <id>` to target hosted saved queries; otherwise commands operate on the current project.",
  ],
});

export const graphQueryRunCommand = defineCommand({
  surface: "graph.query.run",
  command: "fide graph query run",
  summary: "Run ad hoc SQL or execute a saved graph query",
  usage: [
    "fide graph query run --graph <name> <query>",
    "fide graph query run --graph <name> --file <query.sql>",
    "fide graph query run --graph <name> --stdin",
    "fide graph query run --graph <name> --name <query-name>",
    "fide graph query run --workspace <workspace-id> --graph <name> --name <query-name>",
  ],
  params: [
    { name: "workspace", type: "string", description: "Workspace id for hosted saved-query execution", valueLabel: "<workspace-id>" },
    { name: "graph", type: "string", required: true, description: "Configured or hosted graph key", valueLabel: "<name>" },
    { name: "name", type: "string", description: "Saved query name instead of ad hoc SQL", valueLabel: "<query-name>" },
    { name: "query-store", type: "string", description: "Hosted query store key when a workspace has more than one query store configured.", valueLabel: "<name>" },
    { name: "limit", type: "number", description: "Maximum row count for hosted saved-query execution", valueLabel: "<n>" },
    { name: "file", type: "string", description: "Read SQL from a file", valueLabel: "<query.sql>" },
    { name: "stdin", type: "boolean", description: "Read SQL from stdin" },
    { name: "allow-write", type: "boolean", description: "Allow write SQL for ad hoc local execution" },
    { name: "pretty", type: "boolean", shorthand: "-p", description: "Human-readable output" },
  ],
  output: {
    ok: "boolean?",
    storeType: "string?",
    key: "string?",
    file: "string?",
    schema: "string?",
    rowCount: "number",
    rows: "array",
    warnings: "string[]?",
    baseUrl: "string?",
    source: "string?",
    workspaceId: "string?",
    workspaceSelectionSource: "string?",
    result: "object?",
  },
  examples: [
    "fide graph query run --graph primary 'select * from statements limit 10'",
    "fide graph query run --graph primary --name recentStatements",
    "fide graph query run --workspace <workspace-id> --graph primary --name recentStatements",
  ],
});

export const graphQueryListCommand = defineCommand({
  surface: "graph.query.list",
  command: "fide graph query list",
  summary: "List project or hosted graph queries",
  usage: [
    "fide graph query list",
    "fide graph query list --graph <name>",
    "fide graph query list --workspace <workspace-id>",
  ],
  params: [
    { name: "workspace", type: "string", description: "Workspace id for hosted query listing", valueLabel: "<workspace-id>" },
    { name: "graph", type: "string", description: "Optional graph filter", valueLabel: "<name>" },
    { name: "fide-dir", type: "string", description: "Local .fide directory override", valueLabel: "<path>" },
    { name: "query-store", type: "string", description: "Hosted query store key when a workspace has more than one query store configured.", valueLabel: "<name>" },
    { name: "pretty", type: "boolean", shorthand: "-p", description: "Human-readable output" },
  ],
  output: {
    root: "string?",
    baseUrl: "string?",
    source: "string?",
    workspaceId: "string?",
    workspaceSelectionSource: "string?",
    queryStoreKey: "string?",
    queries: "array",
    next: "object?",
  },
});

export const graphQueryGetCommand = defineCommand({
  surface: "graph.query.get",
  command: "fide graph query get",
  summary: "Read one project or hosted graph query",
  usage: [
    "fide graph query get --graph <name> --name <query-name>",
    "fide graph query get --workspace <workspace-id> --graph <name> --name <query-name>",
  ],
  params: [
    { name: "workspace", type: "string", description: "Workspace id for hosted query reads", valueLabel: "<workspace-id>" },
    { name: "graph", type: "string", required: true, description: "Graph key", valueLabel: "<name>" },
    { name: "name", type: "string", required: true, description: "Saved query name", valueLabel: "<query-name>" },
    { name: "fide-dir", type: "string", description: "Local .fide directory override", valueLabel: "<path>" },
    { name: "query-store", type: "string", description: "Hosted query store key when a workspace has more than one query store configured.", valueLabel: "<name>" },
    { name: "pretty", type: "boolean", shorthand: "-p", description: "Human-readable output" },
  ],
  output: {
    root: "string?",
    baseUrl: "string?",
    source: "string?",
    workspaceId: "string?",
    workspaceSelectionSource: "string?",
    query: "object",
    next: "object?",
  },
});

export const graphQuerySaveCommand = defineCommand({
  surface: "graph.query.save",
  command: "fide graph query save",
  summary: "Save a project or hosted graph query",
  usage: [
    "fide graph query save --graph <name> --name <query-name> <query>",
    "fide graph query save --graph <name> --name <query-name> --file <query.sql>",
    "fide graph query save --workspace <workspace-id> --graph <name> --name <query-name> <query>",
  ],
  params: [
    { name: "workspace", type: "string", description: "Workspace id for hosted query writes", valueLabel: "<workspace-id>" },
    { name: "graph", type: "string", required: true, description: "Graph key targeted by this query", valueLabel: "<name>" },
    { name: "name", type: "string", required: true, description: "Saved query name", valueLabel: "<query-name>" },
    { name: "description", type: "string", description: "Optional query description", valueLabel: "<text>" },
    { name: "fide-dir", type: "string", description: "Local .fide directory override", valueLabel: "<path>" },
    { name: "query-store", type: "string", description: "Hosted query store key when a workspace has more than one query store configured.", valueLabel: "<name>" },
    { name: "file", type: "string", description: "Read SQL from a file", valueLabel: "<query.sql>" },
    { name: "stdin", type: "boolean", description: "Read SQL from stdin" },
    { name: "pretty", type: "boolean", shorthand: "-p", description: "Human-readable output" },
  ],
  output: {
    ok: "boolean?",
    mode: "string?",
    graphKey: "string?",
    name: "string?",
    outPath: "string?",
    warnings: "string[]?",
    baseUrl: "string?",
    source: "string?",
    workspaceId: "string?",
    workspaceSelectionSource: "string?",
    queryStoreKey: "string?",
    query: "object?",
    next: "object?",
  },
  examples: [
    "fide graph query save --graph primary --name recentStatements 'select * from statements limit 10'",
    "fide graph query save --workspace <workspace-id> --graph primary --name recentStatements 'select * from statements limit 10'",
  ],
  notes: [
    "Without `--workspace`, saves into the current project's `.fide/queries/<graph>/` directory.",
    "With `--workspace`, saves into the hosted workspace query store.",
    "Hosted saved queries only support read-only SQL and are workspace-shared.",
  ],
});

export const graphBuildCommand = defineCommand({
  surface: "graph.build",
  command: "fide graph build",
  summary: "Build configured graph or query stores from graph sources",
  usage: [
    "fide graph build --graph <name>",
    "fide graph build --query-store <name>",
    "fide graph build --dry-run --graph <name>",
  ],
  params: [
    { name: "graph", type: "string", description: "Configured graph name with a recipe", valueLabel: "<name>" },
    { name: "query-store", type: "string", description: "Configured query store name", valueLabel: "<name>" },
    { name: "dry-run", type: "boolean", description: "Resolve targets and inputs without mutating runtime state" },
    { name: "pretty", type: "boolean", shorthand: "-p", description: "Human-readable output" },
  ],
  output: {
    ok: "boolean",
    mode: "string?",
    storeType: "string",
    key: "string?",
    file: "string?",
    schema: "string?",
    statementCount: "number",
    queryCount: "number?",
    steps: "array<{ from: string, statementCount: number }>",
    stepCount: "number?",
    target: "object?",
    queries: "array?",
    lastRunAt: "string",
    warnings: "string[]?",
  },
  examples: [
    "fide graph build --graph sqlite",
    "fide graph build --graph combined",
    "fide graph build --dry-run --graph combined",
    "fide graph build --query-store postgresQueries",
  ],
  notes: [
    "Recipe SQL may include $lastRunAt for incremental runs.",
    "On the first run, $lastRunAt resolves to 1970-01-01T00:00:00.000Z.",
    "Local fide-jsonl recipe steps may use fromDateUTC/toDateUTC; these apply at UTC date granularity based on .fide/statements/YYYY/MM/DD folders.",
    "Query-store builds load local .fide/queries/<graph>/<name>.sql files.",
    "Use `--dry-run` to preview resolved build inputs and targets before mutating runtime state.",
  ],
});

export const GRAPH_COMMAND_METADATA = [
  graphWriteCommand,
  graphDraftCommand,
  graphStatusCommand,
  graphListCommand,
  graphGetCommand,
  graphSaveCommand,
  graphQueryCommand,
  graphQueryRunCommand,
  graphQueryListCommand,
  graphQueryGetCommand,
  graphQuerySaveCommand,
  graphBuildCommand,
  graphDefsCommand,
] as const;

export const GRAPH_COMMAND_SCHEMAS = commandSchemas(GRAPH_COMMAND_METADATA);
