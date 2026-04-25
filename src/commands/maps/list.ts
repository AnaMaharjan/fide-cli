import { parseArgs, getStringFlag } from "../../util/command/args.js";
import { booleanKeysFromCommand, defineCommand, mergeBooleanKeySets, renderCommandHelp } from "../../util/command/command-metadata.js";
import { printJson } from "../../util/command/io.js";
import { formatPretty } from "../../util/command/pretty.js";
import { isMapKind, MAPS_SCOPE, readInstalledMapSummaries, resolveMapsFideDir, type InstalledMapSummary, type MapKind } from "./shared.js";

export const mapsListCommand = defineCommand({
  surface: "maps.list",
  command: "fide maps list",
  outputType: "MapsListOutput",
  summary: "List installed local Fide map blocks and components",
  usage: ["fide maps list [--kind block|component] [--pretty|-p]"],
  paramOrder: ["kind", "pretty"],
  params: {
    kind: { kind: "string", enum: ["block", "component"], description: "Filter installed maps by kind", valueLabel: "<kind>" },
    pretty: { kind: "boolean", shorthand: "-p", description: "Human-readable output" },
  },
  examples: ["fide maps list", "fide maps list --kind component"],
  notes: ["Lists map JSON from the resolved FIDE_DIR/maps directory."],
});

const MAPS_LIST_PARSE_KEYS = mergeBooleanKeySets(booleanKeysFromCommand(mapsListCommand));

export type MapsListOutput = {
  scope: typeof MAPS_SCOPE;
  command: "fide maps list";
  fideDir: string;
  kind: MapKind | null;
  maps: InstalledMapSummary[];
};

export async function runMapsList(args: string[]): Promise<number> {
  const { flags, positionals } = parseArgs(args, { booleanKeys: MAPS_LIST_PARSE_KEYS });
  const useJson = !flags.has("pretty");
  if (flags.has("help")) {
    console.log(renderCommandHelp(mapsListCommand));
    return 0;
  }
  if (positionals.length > 0) throw new Error(`Unexpected arguments: ${positionals.join(" ")}`);

  const kindRaw = getStringFlag(flags, "kind");
  if (flags.has("kind") && kindRaw === null) {
    throw new Error("Missing value for --kind. Expected block or component.");
  }
  if (kindRaw !== null && !isMapKind(kindRaw)) {
    throw new Error("Invalid --kind. Expected block or component.");
  }

  const fideDir = resolveMapsFideDir();
  const payload: MapsListOutput = {
    scope: MAPS_SCOPE,
    command: "fide maps list",
    fideDir,
    kind: kindRaw,
    maps: await readInstalledMapSummaries(fideDir, kindRaw ?? undefined),
  };

  if (useJson) {
    printJson(payload);
  } else {
    console.log(formatPretty(MAPS_SCOPE, payload));
  }
  return 0;
}
