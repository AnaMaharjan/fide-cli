import { FIDE_ENTITY_TYPES } from "@chris-test/graph";

/**
 * Machine-readable command schemas for agent introspection.
 * Used by `fide schema` and by `--help --json` on individual commands.
 */
const FIDE_ENTITY_TYPE_ENUM = Object.keys(FIDE_ENTITY_TYPES).sort();

export const COMMAND_SCHEMAS: Record<string, { command: string; params: Array<{ name: string; type: string; required?: boolean; description?: string; enum?: string[] }>; output: Record<string, string> }> = {
  "graph.init": {
    command: "fide graph init",
    params: [
      { name: "target", type: "string", required: false, description: "Configured graph target key or local directory path" },
      { name: "dir", type: "string", required: false, description: "Target directory (default: cwd)" },
      { name: "dangerously-drop", type: "boolean", required: false, description: "Postgres only: drop graph tables/types before re-initializing (requires --yes)" },
      { name: "yes", type: "boolean", required: false, description: "Required confirmation for --dangerously-drop" },
      { name: "pretty", type: "boolean", required: false, description: "Human-readable output" },
    ],
    output: {
      ok: "boolean",
      root: "string?",
      created: "string[]?",
      target: "string?",
      key: "string?",
      schema: "string?",
      statementsTable: "string?",
      initialized: "boolean?",
      dropped: "boolean?",
    },
  },
  "graph.query": {
    command: "fide graph query",
    params: [
      { name: "sql", type: "string", required: true, description: "SQL query" },
      { name: "pretty", type: "boolean", required: false, description: "Human-readable output" },
      { name: "allow-write", type: "boolean", required: false, description: "Allow write queries" },
      { name: "fields", type: "string", required: false, description: "Comma-separated field mask (e.g. id,name)" },
      { name: "page-size", type: "number", required: false, description: "Page size for pagination" },
    ],
    output: { ok: "boolean", rows: "array?", error: "string?" },
  },
  "graph.add": {
    command: "fide graph add",
    params: [
      { name: "target", type: "string", required: false, description: "Configured graph target key or local directory path" },
      { name: "stdin", type: "boolean", required: false, description: "Primary agent path: read statement inputs from stdin" },
      { name: "file", type: "string", required: false, description: "Primary agent path: input file path" },
      { name: "format", type: "string", required: false, enum: ["json", "jsonl", "fsd"] },
      { name: "no-normalize", type: "boolean", required: false },
      { name: "pretty", type: "boolean", required: false, description: "Human-readable output" },
      { name: "fields", type: "string", required: false, description: "Output field mask (e.g. root,outPath)" },
    ],
    output: {
      root: "string",
      statementCount: "number",
      mode: "string",
      outPath: "string?",
      target: "string?",
      key: "string?",
    },
  },
  "graph.draft": {
    command: "fide graph draft",
    params: [
      { name: "target", type: "string", required: false, description: "Configured graph target key or local directory path" },
      { name: "stdin", type: "boolean", required: false, description: "Primary agent path: read statement inputs from stdin" },
      { name: "file", type: "string", required: false, description: "Primary agent path: input file path" },
      { name: "format", type: "string", required: false, enum: ["json", "jsonl", "fsd"] },
      { name: "no-normalize", type: "boolean", required: false },
      { name: "pretty", type: "boolean", required: false, description: "Human-readable output" },
      { name: "fields", type: "string", required: false, description: "Output field mask (e.g. root,outPath)" },
    ],
    output: {
      root: "string",
      statementCount: "number",
      mode: "string",
      outPath: "string",
    },
  },
  "graph.status": {
    command: "fide graph status",
    params: [
      { name: "target", type: "string", required: false, description: "Optional configured graph target key or local directory path; omitted means all configured targets" },
    ],
    output: {
      ok: "boolean",
      target: "string?",
      configured: "boolean?",
      initialized: "boolean?",
      root: "string?",
      dir: "string?",
      configuredFromSettings: "boolean?",
      fideDir: "string?",
      statementsDir: "string?",
      statementsDirPresent: "boolean?",
      missing: "string[]?",
      key: "string?",
      databaseUrlConfigured: "boolean?",
      databaseUrlSource: "string?",
      databaseUrlEnv: "string?",
      reachable: "boolean?",
      schema: "string?",
      statementsTable: "string?",
      error: "string?",
      next: "object?",
      targets: "array<{ key: string, type: string, initialized: boolean, next?: object }>?",
    },
  },
  "graph.statement-input": {
    command: "fide schema graph.statement-input",
    params: [],
    output: {
      format: "string",
      rootType: "string",
      required: "string[]",
      subjectEntityTypeEnum: "string[]",
      subjectReferenceTypeEnum: "string[]",
      predicateEntityTypeEnum: "string[]",
      predicateReferenceTypeEnum: "string[]",
      objectEntityTypeEnum: "string[]",
      objectReferenceTypeEnum: "string[]",
      policyNotes: "string[]",
    },
  },
  "graph.defs": {
    command: "fide graph defs",
    params: [
      { name: "entity", type: "string", required: false, description: "Optional entity type filter (e.g. Person, NetworkResource)" },
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
  },
};

export const EXTENDED_SCHEMAS = {
  "graph.statement-input": {
    command: "fide schema graph.statement-input",
    format: "fcp.statement-input.v0",
    rootType: "array",
    required: ["subject", "predicate", "object"],
    item: {
      type: "object",
      required: ["subject", "predicate", "object"],
      properties: {
        subject: {
          type: "object",
          required: ["referenceIdentifier", "entityType", "referenceType"],
          properties: {
            referenceIdentifier: { type: "string" },
            entityType: { type: "string", enum: FIDE_ENTITY_TYPE_ENUM },
            referenceType: { type: "string", enum: FIDE_ENTITY_TYPE_ENUM },
          },
        },
        predicate: {
          type: "object",
          required: ["referenceIdentifier", "entityType", "referenceType"],
          properties: {
            referenceIdentifier: { type: "string", format: "uri" },
            entityType: { type: "string", enum: ["Concept"] },
            referenceType: { type: "string", enum: ["NetworkResource"] },
          },
        },
        object: {
          type: "object",
          required: ["referenceIdentifier", "entityType", "referenceType"],
          properties: {
            referenceIdentifier: { type: "string" },
            entityType: { type: "string", enum: FIDE_ENTITY_TYPE_ENUM },
            referenceType: { type: "string", enum: FIDE_ENTITY_TYPE_ENUM },
          },
        },
      },
    },
    subjectEntityTypeEnum: FIDE_ENTITY_TYPE_ENUM,
    subjectReferenceTypeEnum: FIDE_ENTITY_TYPE_ENUM,
    predicateEntityTypeEnum: ["Concept"],
    predicateReferenceTypeEnum: ["NetworkResource"],
    objectEntityTypeEnum: FIDE_ENTITY_TYPE_ENUM,
    objectReferenceTypeEnum: FIDE_ENTITY_TYPE_ENUM,
    policyNotes: [
      "Predicate must use entityType=Concept and referenceType=NetworkResource.",
      "Allowed entity/reference pairings are further validated by Fide ID policy at runtime.",
      "Use --format json|jsonl|fsd as needed; this schema describes statement-input payload shape.",
    ],
  },
} as const;
