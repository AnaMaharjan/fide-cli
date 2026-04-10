import {
  FIDE_ENTITY_TYPES,
  STATEMENT_GUIDE_EXAMPLES,
  type FideEntityTypeName,
} from "@chris-test/graph";
import { getStringFlag, hasFlag, parseArgs, shouldUseJsonOutput } from "../../util/command/args.js";
import {
  booleanKeysFromCommand,
  defineCommand,
  mergeBooleanKeySets,
  renderCommandHelp,
} from "../../util/command/command-metadata.js";
import { printJson } from "../../util/command/io.js";
import { formatPretty } from "../../util/command/pretty.js";
import { errorResponse, okResponse } from "../../util/command/response.js";

export const statementsGuideCommand = defineCommand({
  surface: "statements.guide",
  command: "fide statements guide",
  outputType: "StatementsGuideOutput",
  summary: "Inspect statement guidance and allowed entity types",
  usage: [
    "fide statements guide [--entity <EntityType>] [--pretty|-p]",
    "fide statements guide <EntityType>",
  ],
  paramOrder: ["entity", "pretty"],
  params: {
    entity: { kind: "string", description: "Optional entity type filter", valueLabel: "<EntityType>" },
    pretty: { kind: "boolean", shorthand: "-p", description: "Human-readable output" },
  },
  examples: [
    "fide statements guide",
    "fide statements guide --entity NetworkResource",
    "fide statements guide Person",
  ],
});

const STATEMENTS_GUIDE_PARSE_KEYS = mergeBooleanKeySets(booleanKeysFromCommand(statementsGuideCommand));

export type StatementsGuideOutput = {
  ok: true;
  scope: "statements-guide.v1";
  command: "fide statements guide";
  next?: Record<string, unknown>;
  layers: Record<string, string>;
  entities?: unknown[];
  entity?: unknown;
  statementRules: unknown[];
};

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

type EntityGuideListItem = {
  name: FideEntityTypeName;
  description: string;
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

function buildEntityGuideListItem(name: FideEntityTypeName): EntityGuideListItem {
  const spec = FIDE_ENTITY_TYPES[name];
  return {
    name,
    description: spec.description,
  };
}

function rulesPayloadBase() {
  return {
    layers: {
      fideId: "/fide-id",
      vocabulary: "/vocabulary",
      fcp: "/fcp",
    },
    statementRules: [...STATEMENT_GUIDE_EXAMPLES],
  };
}

export async function runStatementsGuide(args: string[] = []): Promise<number> {
  const { flags, positionals } = parseArgs(args, { booleanKeys: STATEMENTS_GUIDE_PARSE_KEYS });
  const useJson = shouldUseJsonOutput(flags);

  if (hasFlag(flags, "help") || hasFlag(flags, "-h")) {
    console.log(renderCommandHelp(statementsGuideCommand));
    return 0;
  }

  const requestedEntityRaw = getStringFlag(flags, "entity") ?? positionals[0] ?? null;
  const entityNames = Object.keys(FIDE_ENTITY_TYPES) as FideEntityTypeName[];
  const entities = entityNames.map(buildEntityGuideListItem);

  if (requestedEntityRaw) {
    const parsed = parseEntityName(requestedEntityRaw);
    if (!parsed) {
      const payload = errorResponse("statements-guide.v1", `Unknown entity type: ${requestedEntityRaw}`, {
        validEntityTypes: entityNames,
      }, { command: "fide statements guide" });
      printJson(payload);
      return 1;
    }

    const payload = okResponse("statements-guide.v1", {
      ...rulesPayloadBase(),
      entity: buildEntitySummary(parsed),
    }, {
      command: "fide statements guide",
      next: {
        docsCommand: "fide docs <path>",
      },
    });

    if (useJson) {
      printJson(payload);
    } else {
      console.log(formatPretty("statements-guide.v1", payload) ?? JSON.stringify(payload, null, 2));
    }
    return 0;
  }

  const payload = okResponse("statements-guide.v1", {
    ...rulesPayloadBase(),
    entities,
  }, {
    command: "fide statements guide",
    next: {
      docsCommand: "fide docs <path>",
    },
  });

  if (useJson) {
    printJson(payload);
  } else {
    console.log(formatPretty("statements-guide.v1", payload) ?? JSON.stringify(payload, null, 2));
  }
  return 0;
}
