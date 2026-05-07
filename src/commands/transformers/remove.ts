import { parseArgs } from "../../util/command/args.js";
import { booleanKeysFromCommand, defineCommand, mergeBooleanKeySets, renderCommandHelp } from "../../util/command/command-metadata.js";
import { printJson } from "../../util/command/io.js";
import { formatPretty } from "../../util/command/pretty.js";
import { postDaemonMapsRemove } from "../../util/daemon/daemon-http.js";
import {
  kindFromMapKey,
  MAPS_SCOPE,
  resolveMapKeyPath,
  resolveMapsFideDir,
  type MapKind,
} from "./shared.js";

export const mapsRemoveCommand = defineCommand({
  surface: "maps.remove",
  command: "fide maps remove",
  outputType: "MapsRemoveOutput",
  summary: "Remove one installed Fide map block or component",
  usage: ["fide maps remove <map-key> [--pretty|-p]"],
  paramOrder: ["pretty"],
  params: {
    pretty: { kind: "boolean", shorthand: "-p", description: "Human-readable output" },
  },
  examples: ["fide maps remove blocks.person.social-profile.linkedin"],
  notes: ["The map key determines the path removed under FIDE_DIR/maps."],
});

const MAPS_REMOVE_PARSE_KEYS = mergeBooleanKeySets(booleanKeysFromCommand(mapsRemoveCommand));

export type MapsRemoveOutput = {
  scope: typeof MAPS_SCOPE;
  command: "fide maps remove";
  fideDir: string;
  mapKey: string;
  kind: MapKind;
  path: string;
  removed: boolean;
};

export async function runMapsRemove(args: string[]): Promise<number> {
  const { flags, positionals } = parseArgs(args, { booleanKeys: MAPS_REMOVE_PARSE_KEYS });
  const useJson = !flags.has("pretty");
  if (flags.has("help")) {
    console.log(renderCommandHelp(mapsRemoveCommand));
    return 0;
  }

  const mapKey = positionals[0];
  if (!mapKey) throw new Error("Missing map key.");
  if (positionals.length > 1) throw new Error(`Unexpected extra arguments: ${positionals.slice(1).join(" ")}`);
  const kind = kindFromMapKey(mapKey);
  if (!kind) throw new Error("Map key must start with blocks. or components.");

  const fideDir = resolveMapsFideDir();
  const path = resolveMapKeyPath(fideDir, mapKey);
  await postDaemonMapsRemove(mapKey);
  const payload: MapsRemoveOutput = {
    scope: MAPS_SCOPE,
    command: "fide maps remove",
    fideDir,
    mapKey,
    kind,
    path,
    removed: true,
  };

  if (useJson) {
    printJson(payload);
  } else {
    console.log(formatPretty(MAPS_SCOPE, payload));
  }
  return 0;
}
