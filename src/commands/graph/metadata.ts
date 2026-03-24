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
    "Use `fide graph query save` to save project query definitions.",
  ],
});

export const graphDraftCommand = defineCommand({
  surface: "graph.statements.draft",
  command: "fide graph statements draft",
  summary: "Create a markdown statement draft in a local .fide directory",
  usage: [
    "fide graph statements draft [--fide-dir <path>] --name <draft-name> <json>",
    "fide graph statements draft [--fide-dir <path>] --name <draft-name> --file <inputs> [--format <json|jsonl|fsd>]",
    "fide graph statements draft [--fide-dir <path>] --name <draft-name> --stdin [--format <json|jsonl|fsd>]",
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
    "Draft statement lines are labeled @1, @2, ... for local references.",
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
  ],
  params: [
    { name: "fide-dir", type: "string", description: "Optional local .fide directory override", valueLabel: "<path>" },
    { name: "graph", type: "string", description: "Configured graph key", valueLabel: "<name>" },
  ],
  output: {
    ok: "boolean",
    local: "object?",
    graphs: "array<object>",
    next: "object?",
  },
  notes: [
    "With no selector, also returns local .fide status.",
    "Use `--graph <name>` to narrow the graph status to one configured graph.",
  ],
});

export const graphListCommand = defineCommand({
  surface: "graph.list",
  command: "fide graph list",
  summary: "List hosted graphs for a workspace",
  usage: [
    "fide graph list [--workspace <workspace-id>] [--profile <name>]",
  ],
  params: [
    { name: "workspace", type: "string", required: false, description: "Workspace to query. If omitted, resolve from FIDE_WORKSPACE_ID.", valueLabel: "<workspace-id>" },
    { name: "profile", type: "string", required: false, description: "Named CLI auth/config profile to use for hosted requests. Controls credentials and base URL. If omitted, resolve from env, project settings, or the default profile.", valueLabel: "<name>" },
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
    "fide graph get [--workspace <workspace-id>] [--profile <name>] --graph <name>",
  ],
  params: [
    { name: "workspace", type: "string", required: false, description: "Workspace to query. If omitted, resolve from FIDE_WORKSPACE_ID.", valueLabel: "<workspace-id>" },
    { name: "profile", type: "string", required: false, description: "Named CLI auth/config profile to use for hosted requests. Controls credentials and base URL. If omitted, resolve from env, project settings, or the default profile.", valueLabel: "<name>" },
    { name: "graph", type: "string", required: true, description: "Graph key", valueLabel: "<name>" },
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
  summary: "Save hosted graph metadata",
  usage: [
    "fide graph save [--workspace <workspace-id>] [--profile <name>] --graph <name> --type postgres",
    "fide graph save [--workspace <workspace-id>] [--profile <name>] --graph <name> --type sqlite",
    "fide graph save [--workspace <workspace-id>] [--profile <name>] --graph <name> --stdin",
  ],
  params: [
    { name: "workspace", type: "string", required: false, description: "Workspace to update. If omitted, resolve from FIDE_WORKSPACE_ID.", valueLabel: "<workspace-id>" },
    { name: "profile", type: "string", required: false, description: "Named CLI auth/config profile to use for hosted requests. Controls credentials and base URL. If omitted, resolve from env, project settings, or the default profile.", valueLabel: "<name>" },
    { name: "graph", type: "string", required: true, description: "Graph key", valueLabel: "<name>" },
    { name: "type", type: "string", enum: ["postgres", "sqlite", "fide-jsonl"], description: "Hosted graph type" },
    { name: "recipe-file", type: "string", description: "JSON file containing graph recipe steps", valueLabel: "<recipe.json>" },
    { name: "file", type: "string", description: "Read the full hosted graph metadata object from a file", valueLabel: "<graph.json>" },
    { name: "stdin", type: "boolean", description: "Read the full hosted graph metadata object from stdin" },
    { name: "dry-run", type: "boolean", description: "Validate the hosted graph write and show the intended change without saving it" },
    { name: "pretty", type: "boolean", shorthand: "-p", description: "Human-readable output" },
  ],
  output: {
    dryRun: "boolean?",
    wouldChange: "boolean?",
    preview: "object?",
    baseUrl: "string",
    source: "string",
    workspaceId: "string",
    workspaceSelectionSource: "string",
    graphKey: "string",
    graph: "object",
  },
  examples: [
    "fide graph save --workspace <workspace-id> --graph primary",
    "fide graph save --workspace <workspace-id> --graph combined-graph-postgres --type postgres",
  ],
  notes: [
    "This command updates hosted workspace graph metadata.",
    "If no explicit graph definition is provided, `--graph <name>` first looks for a local project graph with the same key in `.fide/settings.json`.",
    "Local connection details stay in project `.fide/settings.json` and are not saved to the workspace.",
    "Use `--dry-run` to preview whether the hosted graph metadata would change before writing it.",
    "Pass `--file` or `--stdin` to provide the full hosted graph metadata object instead of individual flags.",
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
    "Mixed query commands default to local project queries.",
    "Set `FIDE_WORKSPACE_ID` or pass `--workspace <workspace-id>` to target hosted workspace queries.",
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
    "fide graph query run [--workspace <workspace-id>] [--profile <name>] --graph <name> --name <query-name>",
  ],
  params: [
    { name: "workspace", type: "string", description: "Workspace for hosted saved-query execution. If omitted, `--name` runs locally unless FIDE_WORKSPACE_ID is set.", valueLabel: "<workspace-id>" },
    { name: "profile", type: "string", description: "Named CLI auth/config profile to use for hosted saved-query execution. Controls credentials and base URL. If omitted, resolve from env, project settings, or the default profile.", valueLabel: "<name>" },
    { name: "graph", type: "string", required: true, description: "Graph key", valueLabel: "<name>" },
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
  notes: [
    "Without `--workspace` or `FIDE_WORKSPACE_ID`, `--name <query-name>` runs a local project saved query.",
    "With `--workspace` or `FIDE_WORKSPACE_ID`, `--name <query-name>` runs a hosted workspace saved query.",
  ],
});

export const graphQueryListCommand = defineCommand({
  surface: "graph.query.list",
  command: "fide graph query list",
  summary: "List project or hosted graph query summaries",
  usage: [
    "fide graph query list",
    "fide graph query list --graph <name>",
    "fide graph query list [--workspace <workspace-id>] [--profile <name>]",
  ],
  params: [
    { name: "workspace", type: "string", description: "Workspace for hosted query listing. If omitted, list local project queries unless FIDE_WORKSPACE_ID is set.", valueLabel: "<workspace-id>" },
    { name: "profile", type: "string", description: "Named CLI auth/config profile to use for hosted query listing. Controls credentials and base URL. If omitted, resolve from env, project settings, or the default profile.", valueLabel: "<name>" },
    { name: "graph", type: "string", description: "Optional graph filter", valueLabel: "<name>" },
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
    queries: "array",
    next: "object?",
  },
  examples: [
    "fide graph query list",
    "fide graph query list --workspace <workspace-id>",
  ],
  notes: [
    "Without `--workspace` or `FIDE_WORKSPACE_ID`, lists local project query summaries.",
    "With `--workspace` or `FIDE_WORKSPACE_ID`, lists hosted workspace query summaries.",
    "List output is intentionally compact and returns the query identity fields needed to choose one query.",
    "Use `fide graph query get --graph <name> --name <query-name>` to read the full query text for a selected result.",
  ],
});

export const graphQueryGetCommand = defineCommand({
  surface: "graph.query.get",
  command: "fide graph query get",
  summary: "Read one full project or hosted graph query",
  usage: [
    "fide graph query get --graph <name> --name <query-name>",
    "fide graph query get [--workspace <workspace-id>] [--profile <name>] --graph <name> --name <query-name>",
  ],
  params: [
    { name: "workspace", type: "string", description: "Workspace for hosted query reads. If omitted, read local project queries unless FIDE_WORKSPACE_ID is set.", valueLabel: "<workspace-id>" },
    { name: "profile", type: "string", description: "Named CLI auth/config profile to use for hosted query reads. Controls credentials and base URL. If omitted, resolve from env, project settings, or the default profile.", valueLabel: "<name>" },
    { name: "graph", type: "string", required: true, description: "Graph key", valueLabel: "<name>" },
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
    "fide graph query get --graph primary --name recentStatements",
    "fide graph query get --workspace <workspace-id> --graph primary --name recentStatements",
  ],
  notes: [
    "Without `--workspace` or `FIDE_WORKSPACE_ID`, reads one full local project query.",
    "With `--workspace` or `FIDE_WORKSPACE_ID`, reads one full hosted workspace query.",
    "Use `fide graph query list` first when you need to discover the available graph/name pairs.",
  ],
});

export const graphQuerySaveCommand = defineCommand({
  surface: "graph.query.save",
  command: "fide graph query save",
  summary: "Save a project or hosted graph query",
  usage: [
    "fide graph query save --graph <name> --name <query-name> <query>",
    "fide graph query save --graph <name> --name <query-name> --file <query.sql>",
    "fide graph query save --workspace <workspace-id> [--profile <name>] --graph <name> --name <query-name> <query>",
  ],
  params: [
    { name: "workspace", type: "string", description: "Workspace for hosted query writes. If omitted, save locally unless FIDE_WORKSPACE_ID is set.", valueLabel: "<workspace-id>" },
    { name: "profile", type: "string", description: "Named CLI auth/config profile to use for hosted query writes when targeting a hosted workspace. Controls credentials and base URL. If omitted, resolve from env, project settings, or the default profile.", valueLabel: "<name>" },
    { name: "graph", type: "string", required: true, description: "Graph key targeted by this query", valueLabel: "<name>" },
    { name: "name", type: "string", required: true, description: "Saved query name", valueLabel: "<query-name>" },
    { name: "description", type: "string", description: "Optional query description", valueLabel: "<text>" },
    { name: "fide-dir", type: "string", description: "Local .fide directory override", valueLabel: "<path>" },
    { name: "file", type: "string", description: "Read SQL from a file", valueLabel: "<query.sql>" },
    { name: "stdin", type: "boolean", description: "Read SQL from stdin" },
    { name: "dry-run", type: "boolean", description: "Validate the hosted query write and show the intended change without saving it" },
    { name: "pretty", type: "boolean", shorthand: "-p", description: "Human-readable output" },
  ],
  output: {
    targetScope: "string",
    dryRun: "boolean?",
    wouldChange: "boolean?",
    preview: "object?",
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
    query: "object?",
    next: "object?",
  },
  examples: [
    "fide graph query save --graph primary --name recentStatements 'select * from statements limit 10'",
    "fide graph query save --workspace <workspace-id> --graph primary --name recentStatements 'select * from statements limit 10'",
  ],
  notes: [
    "Without `--workspace` or `FIDE_WORKSPACE_ID`, saves into the current project's `.fide/queries/<graph>/` directory.",
    "With `--workspace` or `FIDE_WORKSPACE_ID`, saves into the hosted workspace query list.",
    "Use `--dry-run` to preview whether a hosted workspace query write would change shared state before saving it.",
  ],
});

export const graphBuildCommand = defineCommand({
  surface: "graph.build",
  command: "fide graph build",
  summary: "Build configured graphs from graph sources",
  usage: [
    "fide graph build --graph <name>",
    "fide graph build --dry-run --graph <name>",
  ],
  params: [
    { name: "graph", type: "string", description: "Configured graph name with a recipe", valueLabel: "<name>" },
    { name: "dry-run", type: "boolean", description: "Resolve targets and inputs without mutating runtime state" },
    { name: "pretty", type: "boolean", shorthand: "-p", description: "Human-readable output" },
  ],
  output: {
    ok: "boolean",
    mode: "string?",
    graphStoreType: "string",
    key: "string?",
    file: "string?",
    schema: "string?",
    statementCount: "number",
    steps: "array<{ from: string, statementCount: number }>",
    stepCount: "number?",
    target: "object?",
    lastRunAt: "string",
    warnings: "string[]?",
  },
  examples: [
    "fide graph build --graph sqlite",
    "fide graph build --graph combined",
    "fide graph build --dry-run --graph combined",
  ],
  notes: [
    "Recipe SQL may include $lastRunAt for incremental runs.",
    "On the first run, $lastRunAt resolves to 1970-01-01T00:00:00.000Z.",
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
