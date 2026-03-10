/**
 * Machine-readable command schemas for agent introspection.
 * Used by `fide schema` and by `--help --json` on individual commands.
 */
export const COMMAND_SCHEMAS: Record<string, { command: string; params: Array<{ name: string; type: string; required?: boolean; description?: string; enum?: string[] }>; output: Record<string, string> }> = {
  init: {
    command: "fide init",
    params: [
      { name: "dir", type: "string", required: false, description: "Target directory (default: cwd)" },
      { name: "json", type: "boolean", required: false, description: "Machine-readable output" },
    ],
    output: { ok: "boolean", root: "string", created: "string[]" },
  },
  "graph.query": {
    command: "fide graph query",
    params: [
      { name: "sql", type: "string", required: true, description: "SQL query" },
      { name: "json", type: "boolean", required: false, description: "Machine-readable output" },
      { name: "allow-write", type: "boolean", required: false, description: "Allow write queries" },
      { name: "fields", type: "string", required: false, description: "Comma-separated field mask (e.g. id,name)" },
      { name: "page-size", type: "number", required: false, description: "Page size for pagination" },
    ],
    output: { ok: "boolean", rows: "array?", error: "string?" },
  },
  "graph.add": {
    command: "fide graph add",
    params: [
      { name: "local", type: "boolean", required: false, description: "Write to a local .fide workspace target" },
      { name: "target", type: "string", required: false, description: "Target directory path (overrides cwd and any .fide/settings.json graphDir)" },
      { name: "stdin", type: "boolean", required: false, description: "Primary agent path: read statement inputs from stdin" },
      { name: "in", type: "string", required: false, description: "Primary agent path: input file path" },
      { name: "params", type: "string", required: false, description: "Primary agent path: raw JSON payload (array of statement inputs)" },
      { name: "format", type: "string", required: false, enum: ["json", "jsonl", "fsd"] },
      { name: "no-normalize", type: "boolean", required: false },
      { name: "draft", type: "boolean", required: false },
      { name: "json", type: "boolean", required: false },
      { name: "fields", type: "string", required: false, description: "Output field mask (e.g. root,outPath)" },
    ],
    output: { root: "string", statementCount: "number", mode: "string", outPath: "string" },
  },
  "graph.validate": {
    command: "fide graph validate",
    params: [
      { name: "in", type: "string", required: true, description: "Input file path" },
      { name: "format", type: "string", required: false, enum: ["json", "jsonl", "fsd"] },
      { name: "json", type: "boolean", required: false },
      { name: "fields", type: "string", required: false, description: "Output field mask (e.g. root,statementCount)" },
    ],
    output: { ok: "boolean", statementCount: "number", root: "string" },
  },
  "graph.root": {
    command: "fide graph root",
    params: [
      { name: "in", type: "string", required: true, description: "Input file path" },
      { name: "format", type: "string", required: false, enum: ["json", "jsonl", "fsd"] },
      { name: "json", type: "boolean", required: false },
    ],
    output: { root: "string" },
  },
  "graph.status": {
    command: "fide graph status",
    params: [
      { name: "target", type: "string", required: false, description: "Target directory path (overrides cwd and any .fide/settings.json graphDir)" },
    ],
    output: {
      ok: "boolean",
      initialized: "boolean",
      root: "string",
      dir: "string",
      configuredFromSettings: "boolean",
      fideDir: "string",
      statementsDir: "string",
      missing: "string[]",
    },
  },
};
