import { readFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { parseArgs } from "../../util/command/args.js";
import { postDaemonMapsInstall } from "../../util/daemon/daemon-http.js";
import { booleanKeysFromCommand, defineCommand, mergeBooleanKeySets, renderCommandHelp } from "../../util/command/command-metadata.js";
import { printJson } from "../../util/command/io.js";
import { formatPretty } from "../../util/command/pretty.js";
import {
  assertMapDocument,
  assertRegistryFile,
  isRemoteSource,
  MAPS_SCOPE,
  parseJsonObject,
  parseRegistryItem,
  registryDependencies,
  registryFiles,
  resolveMapsFideDir,
  resolveRegistryDependency,
  resolveRegistryTarget,
  validateMapPathConvention,
  type InstalledMapSummary,
  type MapDocument,
  type RegistryItem,
} from "./shared.js";

export const mapsAddCommand = defineCommand({
  surface: "maps.add",
  command: "fide maps add",
  outputType: "MapsAddOutput",
  summary: "Install a Fide map block or component from a shadcn-compatible registry item",
  usage: ["fide maps add <registry-item-url-or-file> [--pretty|-p]"],
  paramOrder: ["pretty"],
  params: {
    pretty: { kind: "boolean", shorthand: "-p", description: "Human-readable output" },
  },
  examples: [
    "fide maps add http://localhost:2996/r/fide-map-block-linkedin-profile.json",
    "fide maps add apps/map-registry/public/r/fide-map-component-identity-named-entity.json",
  ],
  notes: [
    "Only registry:item documents with registry:file entries are supported.",
    "Registry file targets must be under ~/.fide/maps/blocks or ~/.fide/maps/components.",
    "~/.fide is resolved with FIDE_DIR and project .fide discovery, not the current project root.",
  ],
});

const MAPS_ADD_PARSE_KEYS = mergeBooleanKeySets(booleanKeysFromCommand(mapsAddCommand));

export type MapsAddOutput = {
  scope: typeof MAPS_SCOPE;
  command: "fide maps add";
  fideDir: string;
  source: string;
  installed: InstalledMapSummary[];
  dependencyCount: number;
};

async function loadRegistryItem(source: string): Promise<RegistryItem> {
  if (isRemoteSource(source)) {
    const response = await fetch(source);
    if (!response.ok) {
      throw new Error(`Failed to fetch registry item ${source}: ${response.status} ${response.statusText}`);
    }
    return parseRegistryItem(await response.text(), source);
  }

  const path = resolve(process.cwd(), source);
  return parseRegistryItem(await readFile(path, "utf8"), path);
}

async function installRegistryItem(
  source: string,
  fideDir: string,
  seen: Set<string>,
  installedByPath: Map<string, InstalledMapSummary>,
  installFiles: { relativePath: string; content: string }[],
): Promise<void> {
  const resolvedSource = isRemoteSource(source) ? source : resolve(process.cwd(), source);
  if (seen.has(resolvedSource)) return;
  seen.add(resolvedSource);

  const item = await loadRegistryItem(resolvedSource);
  for (const dependency of registryDependencies(item)) {
    await installRegistryItem(
      resolveRegistryDependency(resolvedSource, dependency),
      fideDir,
      seen,
      installedByPath,
      installFiles,
    );
  }

  for (const file of registryFiles(item)) {
    assertRegistryFile(file);
    const { path, kind } = resolveRegistryTarget(fideDir, file.target);
    const parsed = parseJsonObject(file.content, String(file.target ?? path));
    const document = assertMapDocument(parsed, String(file.target ?? path));
    validateMapPathConvention(fideDir, path, document);
    const content = `${JSON.stringify(document, null, 2)}\n`;
    const rel = relative(fideDir, path).replace(/\\/g, "/");
    if (!rel || rel.startsWith("..")) {
      throw new Error(`Resolved map path is outside FIDE_DIR: ${path}`);
    }
    installFiles.push({ relativePath: rel, content });
    installedByPath.set(path, {
      mapKey: document.mapKey,
      kind,
      title: document.title,
      path,
    });
  }
}

export async function runMapsAdd(args: string[]): Promise<number> {
  const { flags, positionals } = parseArgs(args, { booleanKeys: MAPS_ADD_PARSE_KEYS });
  const useJson = !flags.has("pretty");
  if (flags.has("help")) {
    console.log(renderCommandHelp(mapsAddCommand));
    return 0;
  }

  const source = positionals[0];
  if (!source) throw new Error("Missing registry item URL or file path.");
  if (positionals.length > 1) throw new Error(`Unexpected extra arguments: ${positionals.slice(1).join(" ")}`);

  const fideDir = resolveMapsFideDir();
  const seen = new Set<string>();
  const installedByPath = new Map<string, InstalledMapSummary>();
  const installFiles: { relativePath: string; content: string }[] = [];
  await installRegistryItem(source, fideDir, seen, installedByPath, installFiles);
  await postDaemonMapsInstall(installFiles);

  const payload: MapsAddOutput = {
    scope: MAPS_SCOPE,
    command: "fide maps add",
    fideDir,
    source,
    installed: [...installedByPath.values()].sort((a, b) => a.mapKey.localeCompare(b.mapKey)),
    dependencyCount: Math.max(0, seen.size - 1),
  };

  if (useJson) {
    printJson(payload);
  } else {
    console.log(formatPretty(MAPS_SCOPE, payload));
  }
  return 0;
}
