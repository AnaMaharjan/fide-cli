import { FIDE_ENTITY_TYPES } from "@chris-test/graph";
import { REGISTRY_COMMAND_SCHEMAS } from "../../commands/registry.js";
import { GENERATED_TYPE_SCHEMAS } from "../../schema/generated.js";

const FIDE_ENTITY_TYPE_ENUM = Object.keys(FIDE_ENTITY_TYPES).sort();

/** Hand-authored schema surface not derived from a command module (FCP statement input shape). */
const GRAPH_STATEMENT_INPUT_EXTENDED = {
  command: "fide schema --surface graph.statement-input",
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
} as const;

/**
 * Single catalog: command param schemas from the registry, generated `*.output` types, and hand-authored extended entries.
 */
export const UNIFIED_SCHEMAS: Record<string, unknown> = {
  ...REGISTRY_COMMAND_SCHEMAS,
  ...GENERATED_TYPE_SCHEMAS,
  "graph.statement-input": GRAPH_STATEMENT_INPUT_EXTENDED,
};

/**
 * JSON body for successful `fide schema` with no `--surface` argument (`scope: schema-index.v1`),
 * after {@link import("./response.js").okResponse} spreads `data` to the top level
 * alongside `ok`, `scope`, and `command`.
 *
 * **Stable field names** — do not rename or replace with aliases:
 * - **`schemas`**: authoritative surface id → machine-readable schema object.
 * - **`surfaces`**: sorted `string[]`, equal to `Object.keys(schemas).sort()`.
 *
 * Consumers include agents, `scripts/generate-docs/cli-reference.mjs` (`parsed.schemas`), and any tooling that shells out to `fide schema`.
 */
export type SchemaIndexPayloadV1 = {
  surfaces: string[];
  schemas: Record<string, unknown>;
};

/** Runtime key names for `SchemaIndexPayloadV1` (keep in sync with the type and docs generator). */
export const SCHEMA_INDEX_PAYLOAD_V1_KEYS = {
  surfaces: "surfaces",
  schemas: "schemas",
} as const satisfies Record<keyof SchemaIndexPayloadV1, keyof SchemaIndexPayloadV1>;

export function buildSchemaIndexPayload(): SchemaIndexPayloadV1 {
  const schemas = UNIFIED_SCHEMAS;
  return {
    [SCHEMA_INDEX_PAYLOAD_V1_KEYS.surfaces]: Object.keys(schemas).sort(),
    [SCHEMA_INDEX_PAYLOAD_V1_KEYS.schemas]: schemas,
  };
}

/** Command-only param schemas (registry), for callers that must not include generated surfaces. */
export { REGISTRY_COMMAND_SCHEMAS as COMMAND_SCHEMAS };
