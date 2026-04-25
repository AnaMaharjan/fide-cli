import { existsSync } from "node:fs";
import { parseArgs } from "../../util/command/args.js";
import { booleanKeysFromCommand, defineCommand, mergeBooleanKeySets, renderCommandHelp } from "../../util/command/command-metadata.js";
import { printJson } from "../../util/command/io.js";
import { formatPretty } from "../../util/command/pretty.js";
import { kindFromMapKey, MAPS_SCOPE, readMapDocument, resolveMapKeyPath, resolveMapsFideDir, type MapDocument, type MapKind } from "./shared.js";

export const mapsGetCommand = defineCommand({
  surface: "maps.get",
  command: "fide maps get",
  outputType: "MapsGetOutput",
  summary: "Read one installed Fide map block or component",
  usage: ["fide maps get <map-key> [--pretty|-p]"],
  paramOrder: ["pretty"],
  params: {
    pretty: { kind: "boolean", shorthand: "-p", description: "Human-readable output" },
  },
  examples: [
    "fide maps get blocks.person.social-profile.linkedin",
    "fide maps get components.identity.named_entity",
  ],
  notes: ["The map key determines the expected path under FIDE_DIR/maps."],
});

const MAPS_GET_PARSE_KEYS = mergeBooleanKeySets(booleanKeysFromCommand(mapsGetCommand));

export type MapsGetOutput = {
  scope: typeof MAPS_SCOPE;
  command: "fide maps get";
  fideDir: string;
  mapKey: string;
  kind: MapKind;
  path: string;
  document: MapDocument;
};

export async function runMapsGet(args: string[]): Promise<number> {
  const { flags, positionals } = parseArgs(args, { booleanKeys: MAPS_GET_PARSE_KEYS });
  const useJson = !flags.has("pretty");
  if (flags.has("help")) {
    console.log(renderCommandHelp(mapsGetCommand));
    return 0;
  }

  const mapKey = positionals[0];
  if (!mapKey) throw new Error("Missing map key.");
  if (positionals.length > 1) throw new Error(`Unexpected extra arguments: ${positionals.slice(1).join(" ")}`);
  const kind = kindFromMapKey(mapKey);
  if (!kind) throw new Error("Map key must start with blocks. or components.");

  const fideDir = resolveMapsFideDir();
  const path = resolveMapKeyPath(fideDir, mapKey);
  if (!existsSync(path)) throw new Error(`Installed map not found: ${mapKey}.`);

  const payload: MapsGetOutput = {
    scope: MAPS_SCOPE,
    command: "fide maps get",
    fideDir,
    mapKey,
    kind,
    path,
    document: await readMapDocument(path),
  };

  if (useJson) {
    printJson(payload);
  } else {
    console.log(formatPretty(MAPS_SCOPE, payload));
  }
  return 0;
}
