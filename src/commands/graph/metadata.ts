import { commandSchemas, defineCommand } from "../../util/command/command-metadata.js";

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
    "fide graph status --graph <key>",
  ],
  params: [
    { name: "fide-dir", type: "string", description: "Optional local .fide directory override", valueLabel: "<path>" },
    { name: "graph", type: "string", description: "Configured graph key", valueLabel: "<key>" },
  ],
  output: {
    ok: "boolean",
    local: "object?",
    graphs: "array<object>",
    next: "object?",
  },
  notes: [
    "With no selector, also returns local .fide status.",
    "Use `--graph <key>` to narrow the graph status to one configured graph.",
  ],
});

export const graphListCommand = defineCommand({
  surface: "graph.list",
  command: "fide graph list",
  summary: "List local project graphs",
  usage: [
    "fide graph list",
  ],
  params: [
    { name: "pretty", type: "boolean", shorthand: "-p", description: "Human-readable output" },
  ],
  output: {
    targetScope: "string",
    root: "string?",
    graphs: "array",
  },
  examples: [
    "fide graph list",
  ],
  notes: [
    "Lists graph definitions from the current project's `.fide/settings.json`.",
  ],
});

export const graphGetCommand = defineCommand({
  surface: "graph.get",
  command: "fide graph get",
  summary: "Inspect one local project graph",
  usage: [
    "fide graph get --graph <key>",
  ],
  params: [
    { name: "graph", type: "string", required: true, description: "Graph key", valueLabel: "<key>" },
    { name: "pretty", type: "boolean", shorthand: "-p", description: "Human-readable output" },
  ],
  output: {
    targetScope: "string",
    root: "string?",
    graphKey: "string",
    graph: "object",
  },
  examples: [
    "fide graph get --graph primary",
  ],
  notes: [
    "Reads the graph definition from the current project's `.fide/settings.json`.",
  ],
});

export const graphSaveCommand = defineCommand({
  surface: "graph.save",
  command: "fide graph save",
  summary: "Project local graph metadata into a hosted workspace graph",
  usage: [
    "fide graph save --graph <key> --type postgres",
    "fide graph save --graph <key> --type sqlite",
    "fide graph save --graph <key> --stdin",
  ],
  params: [
    { name: "graph", type: "string", required: true, description: "Graph key", valueLabel: "<key>" },
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
    "fide graph save --graph primary",
    "fide graph save --graph combined-graph-postgres --type postgres",
  ],
  notes: [
    "If no explicit graph definition is provided, `--graph <key>` first looks for a local project graph with the same key in `.fide/settings.json`.",
    "Hosted graph writes are one-way projections of shared graph fields from the local project into the workspace bound in project `.fide/settings.json`.",
    "Local connection details stay in project `.fide/settings.json` and are not saved to the workspace.",
    "Use `--dry-run` to preview whether the hosted graph metadata would change before writing it.",
    "Pass `--file` or `--stdin` to provide the full hosted graph metadata object instead of individual flags.",
  ],
});

export const graphBuildCommand = defineCommand({
  surface: "graph.build",
  command: "fide graph build",
  summary: "Build configured graphs from graph sources",
  usage: [
    "fide graph build --graph <key>",
    "fide graph build --dry-run --graph <key>",
  ],
  params: [
    { name: "graph", type: "string", description: "Configured graph key with a recipe", valueLabel: "<key>" },
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
  graphStatusCommand,
  graphListCommand,
  graphGetCommand,
  graphSaveCommand,
  graphBuildCommand,
  graphDefsCommand,
] as const;

export const GRAPH_COMMAND_SCHEMAS = commandSchemas(GRAPH_COMMAND_METADATA);
