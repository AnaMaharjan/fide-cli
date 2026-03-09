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
  "graph.query.sql": {
    command: "fide graph query sql",
    params: [
      { name: "sql", type: "string", required: true, description: "SQL query" },
      { name: "json", type: "boolean", required: false, description: "Machine-readable output" },
      { name: "allow-write", type: "boolean", required: false, description: "Allow write queries" },
      { name: "fields", type: "string", required: false, description: "Comma-separated field mask (e.g. id,name)" },
      { name: "page-size", type: "number", required: false, description: "Page size for pagination" },
    ],
    output: { ok: "boolean", rows: "array?", error: "string?" },
  },
  "graph.statements.add": {
    command: "fide graph statements add",
    params: [
      { name: "in", type: "string", required: false, description: "Input file path" },
      { name: "stdin", type: "boolean", required: false, description: "Read from stdin" },
      { name: "params", type: "string", required: false, description: "Raw JSON payload (array of statement inputs)" },
      { name: "subject", type: "string", required: false, description: "Subject reference (single-statement mode)" },
      { name: "subject-type", type: "string", required: false },
      { name: "subject-source", type: "string", required: false },
      { name: "predicate", type: "string", required: false },
      { name: "object", type: "string", required: false },
      { name: "object-type", type: "string", required: false },
      { name: "object-source", type: "string", required: false },
      { name: "format", type: "string", required: false, enum: ["json", "jsonl", "fsd"] },
      { name: "no-normalize", type: "boolean", required: false },
      { name: "draft", type: "boolean", required: false },
      { name: "json", type: "boolean", required: false },
      { name: "fields", type: "string", required: false, description: "Output field mask (e.g. root,outPath)" },
    ],
    output: { ok: "boolean", root: "string", statementCount: "number", mode: "string", outPath: "string", statementFideIds: "string[]" },
  },
  "graph.statements.validate": {
    command: "fide graph statements validate",
    params: [
      { name: "in", type: "string", required: true, description: "Input file path" },
      { name: "format", type: "string", required: false, enum: ["json", "jsonl", "fsd"] },
      { name: "json", type: "boolean", required: false },
      { name: "fields", type: "string", required: false, description: "Output field mask (e.g. root,statementCount)" },
    ],
    output: { ok: "boolean", statementCount: "number", root: "string" },
  },
  "graph.statements.root": {
    command: "fide graph statements root",
    params: [
      { name: "in", type: "string", required: true, description: "Input file path" },
      { name: "format", type: "string", required: false, enum: ["json", "jsonl", "fsd"] },
      { name: "json", type: "boolean", required: false },
    ],
    output: { root: "string" },
  },
};
