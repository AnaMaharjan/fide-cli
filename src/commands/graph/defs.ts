import { FIDE_ENTITY_TYPES, type FideEntityTypeName } from "@chris-test/graph";
import { getStringFlag, hasFlag, parseArgs, shouldUseJsonOutput } from "../../util/args.js";
import { printJson } from "../../util/io.js";
import { COMMAND_SCHEMAS } from "../../util/schemas.js";

type EntitySummary = {
  name: FideEntityTypeName;
  code: string;
  layer: string;
  description: string;
  litmus: string;
  standardFit: string;
  standards: readonly string[];
  allowedReferenceTypes: string[];
  docsPath: string;
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
    docsPath: `/vocabulary/definitions/${toSlug(name)}`,
  };
}

function defsHelp(): string {
  return [
    "Usage:",
    "  fide graph defs [--entity <EntityType>] [--json]",
    "  fide graph defs <EntityType> [--json]",
    "",
    "Examples:",
    "  fide graph defs --json",
    "  fide graph defs --entity NetworkResource --json",
    "  fide graph defs Person --json",
  ].join("\n");
}

export async function runGraphDefs(args: string[] = []): Promise<number> {
  const { flags, positionals } = parseArgs(args);
  const useJson = shouldUseJsonOutput(flags);

  if (hasFlag(flags, "help") || hasFlag(flags, "-h")) {
    if (useJson) {
      printJson(COMMAND_SCHEMAS["graph.defs"]);
    } else {
      console.log(defsHelp());
    }
    return 0;
  }

  const requestedEntityRaw = getStringFlag(flags, "entity") ?? positionals[0] ?? null;
  const entityNames = Object.keys(FIDE_ENTITY_TYPES) as FideEntityTypeName[];
  const entities = entityNames.map(buildEntitySummary);

  if (requestedEntityRaw) {
    const parsed = parseEntityName(requestedEntityRaw);
    if (!parsed) {
      const payload = {
        ok: false,
        error: `Unknown entity type: ${requestedEntityRaw}`,
        validEntityTypes: entityNames,
      };
      if (useJson) {
        printJson(payload);
      } else {
        console.error(payload.error);
        console.error(`Valid entity types: ${entityNames.join(", ")}`);
      }
      return 1;
    }

    const payload = {
      ok: true,
      command: "fide graph defs",
      scope: "graph-defs.v1",
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
          docsPath: "/fcp/specification/statements",
        },
        {
          id: "fcp.predicate.disallow-schema-identifier",
          requirement: "Predicate referenceIdentifier must not be schema:identifier.",
          docsPath: "/fcp/specification/statements",
        },
        {
          id: "fcp.predicate.disallow-schema-sameAs",
          requirement: "Predicate referenceIdentifier must not be schema:sameAs; use owl:sameAs.",
          docsPath: "/fcp/specification/statements",
        },
      ],
    };

    if (useJson) {
      printJson(payload);
    } else {
      console.log(JSON.stringify(payload, null, 2));
    }
    return 0;
  }

  const payload = {
    ok: true,
    command: "fide graph defs",
    scope: "graph-defs.v1",
    layers: {
      fideId: "/fide-id",
      vocabulary: "/vocabulary",
      fcp: "/fcp",
    },
    statementRules: [
      {
        id: "fcp.predicate.concept-network-resource",
        requirement: "Predicate must use entityType=Concept and referenceType=NetworkResource.",
        docsPath: "/fcp/specification/statements",
      },
      {
        id: "fcp.predicate.disallow-schema-identifier",
        requirement: "Predicate referenceIdentifier must not be schema:identifier.",
        docsPath: "/fcp/specification/statements",
      },
      {
        id: "fcp.predicate.disallow-schema-sameAs",
        requirement: "Predicate referenceIdentifier must not be schema:sameAs; use owl:sameAs.",
        docsPath: "/fcp/specification/statements",
      },
    ],
    entities,
  };

  if (useJson) {
    printJson(payload);
  } else {
    console.log(JSON.stringify(payload, null, 2));
  }
  return 0;
}
