import { FIDE_ENTITY_TYPES, type FideEntityTypeName } from "@chris-test/graph";
import { getStringFlag, hasFlag, parseArgs } from "../../util/args.js";
import { renderCommandHelp } from "../../util/command-metadata.js";
import { printJson } from "../../util/io.js";
import { errorResponse, okResponse } from "../../util/response.js";
import { graphDefsCommand } from "./metadata.js";

type EntitySummary = {
  name: FideEntityTypeName;
  code: string;
  layer: string;
  description: string;
  litmus: string;
  standardFit: string;
  standards: readonly string[];
  allowedReferenceTypes: string[];
  path: string;
};

function toSlug(value: string): string {
  return value
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1-$2")
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .toLowerCase();
}

function parseEntityName(input: string): FideEntityTypeName | null {
  const normalized = input.replace(/[-_\s]/g, "").toLowerCase();
  const names = Object.keys(FIDE_ENTITY_TYPES) as FideEntityTypeName[];
  const match = names.find((name) => name.toLowerCase() === normalized);
  return match ?? null;
}

function allowedReferenceTypesFor(name: FideEntityTypeName): string[] {
  if (name === "Statement") return ["Statement"];
  if (name === "Concept") return ["NetworkResource"];
  if (name.endsWith("Literal")) return [name, "NetworkResource"];
  return ["NetworkResource"];
}

function buildEntitySummary(name: FideEntityTypeName): EntitySummary {
  const spec = FIDE_ENTITY_TYPES[name];
  return {
    name,
    code: spec.code,
    layer: spec.layer,
    description: spec.description,
    litmus: spec.litmus,
    standardFit: spec.standardFit,
    standards: spec.standards,
    allowedReferenceTypes: allowedReferenceTypesFor(name),
    path: `/vocabulary/definitions/${toSlug(name)}`,
  };
}

export async function runGraphDefs(args: string[] = []): Promise<number> {
  const { flags, positionals } = parseArgs(args);

  if (hasFlag(flags, "help") || hasFlag(flags, "-h")) {
    console.log(renderCommandHelp(graphDefsCommand));
    return 0;
  }

  const requestedEntityRaw = getStringFlag(flags, "entity") ?? positionals[0] ?? null;
  const entityNames = Object.keys(FIDE_ENTITY_TYPES) as FideEntityTypeName[];
  const entities = entityNames.map(buildEntitySummary);

  if (requestedEntityRaw) {
    const parsed = parseEntityName(requestedEntityRaw);
    if (!parsed) {
      const payload = errorResponse("graph-defs.v1", `Unknown entity type: ${requestedEntityRaw}`, {
        validEntityTypes: entityNames,
      }, { command: "fide graph defs" });
      printJson(payload);
      return 1;
    }

    const payload = okResponse("graph-defs.v1", {
      layers: {
        fideId: "/fide-id",
        vocabulary: "/vocabulary",
        fcp: "/fcp",
      },
      entity: buildEntitySummary(parsed),
      statementRules: [
        {
          id: "fcp.predicate.concept-network-resource",
          requirement: "Predicate must use entityType=Concept and referenceType=NetworkResource.",
          path: "/fcp/specification/statements",
        },
        {
          id: "fcp.predicate.disallow-schema-identifier",
          requirement: "Predicate referenceIdentifier must not be schema:identifier.",
          path: "/fcp/specification/statements",
        },
        {
          id: "fcp.predicate.disallow-schema-sameAs",
          requirement: "Predicate referenceIdentifier must not be schema:sameAs; use owl:sameAs.",
          path: "/fcp/specification/statements",
        },
      ],
    }, {
      command: "fide graph defs",
      next: {
        docsCommand: "fide docs <path>",
      },
    });

    printJson(payload);
    return 0;
  }

  const payload = okResponse("graph-defs.v1", {
    layers: {
      fideId: "/fide-id",
      vocabulary: "/vocabulary",
      fcp: "/fcp",
    },
    statementRules: [
      {
        id: "fcp.predicate.concept-network-resource",
        requirement: "Predicate must use entityType=Concept and referenceType=NetworkResource.",
        path: "/fcp/specification/statements",
      },
      {
        id: "fcp.predicate.disallow-schema-identifier",
        requirement: "Predicate referenceIdentifier must not be schema:identifier.",
        path: "/fcp/specification/statements",
      },
      {
        id: "fcp.predicate.disallow-schema-sameAs",
        requirement: "Predicate referenceIdentifier must not be schema:sameAs; use owl:sameAs.",
        path: "/fcp/specification/statements",
      },
    ],
    entities,
  }, {
    command: "fide graph defs",
    next: {
      docsCommand: "fide docs <path>",
    },
  });

  printJson(payload);
  return 0;
}
