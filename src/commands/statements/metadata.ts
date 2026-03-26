import { commandSchemas, defineCommand } from "../../util/command/command-metadata.js";

export const statementsCommand = defineCommand({
  surface: "statements",
  command: "fide statements",
  summary: "Author local statement batches and drafts",
  usage: [
    "fide statements <command> [flags]",
  ],
  params: [],
  output: {},
});

export const statementsWriteCommand = defineCommand({
  surface: "statements.write",
  command: "fide statements write",
  summary: "Write canonical statement batches into a local project",
  usage: [
    "fide statements write [--fide-dir <path>] <json>",
    "fide statements write [--fide-dir <path>] --file <inputs> [--format <json|jsonl|fsd>]",
    "fide statements write [--fide-dir <path>] --stdin [--format <json|jsonl|fsd>]",
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
  ],
});

export const statementsDraftCommand = defineCommand({
  surface: "statements.draft",
  command: "fide statements draft",
  summary: "Create a markdown statement draft in a local project",
  usage: [
    "fide statements draft [--fide-dir <path>] --name <draft-name> <json>",
    "fide statements draft [--fide-dir <path>] --name <draft-name> --file <inputs> [--format <json|jsonl|fsd>]",
    "fide statements draft [--fide-dir <path>] --name <draft-name> --stdin [--format <json|jsonl|fsd>]",
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
    "Writes to .fide/drafts/statements/<draft-path>/<draft-name>.md.",
    "Reusing the same --name and --path updates the existing draft.",
    "Use `fide statements write` for canonical JSONL batches.",
  ],
});

export const STATEMENTS_COMMAND_SCHEMAS = commandSchemas([statementsCommand, statementsWriteCommand, statementsDraftCommand] as const);
