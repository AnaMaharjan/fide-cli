import { FIDE_ENTITY_TYPES } from "@chris-test/graph";
import { AUTH_COMMAND_SCHEMAS } from "../commands/auth/metadata.js";
import { CORE_COMMAND_SCHEMAS } from "../commands/metadata.js";
import { GRAPH_COMMAND_SCHEMAS } from "../commands/graph/metadata.js";
import { QUERY_COMMAND_SCHEMAS } from "../commands/query/metadata.js";
import { STATEMENTS_COMMAND_SCHEMAS } from "../commands/statements/metadata.js";
import { WORKSPACE_COMMAND_SCHEMAS } from "../commands/workspace/metadata.js";

/**
 * Machine-readable command schemas for agent introspection.
 * Used by `fide schema` and by `--help --json` on individual commands.
 */
const FIDE_ENTITY_TYPE_ENUM = Object.keys(FIDE_ENTITY_TYPES).sort();

export const COMMAND_SCHEMAS: Record<string, { command: string; params: Array<{ name: string; type: string; required?: boolean; description?: string; enum?: string[] }>; output: Record<string, string> }> = {
  ...CORE_COMMAND_SCHEMAS,
  ...GRAPH_COMMAND_SCHEMAS,
  ...QUERY_COMMAND_SCHEMAS,
  ...STATEMENTS_COMMAND_SCHEMAS,
  ...AUTH_COMMAND_SCHEMAS,
  ...WORKSPACE_COMMAND_SCHEMAS,
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
