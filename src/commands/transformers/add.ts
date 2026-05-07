import { readFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { parseArgs } from "../../util/command/args.js";
import { postDaemonTransformersInstall } from "../../util/daemon/daemon-http.js";
import { booleanKeysFromCommand, defineCommand, mergeBooleanKeySets, renderCommandHelp } from "../../util/command/command-metadata.js";
import { printJson } from "../../util/command/io.js";
import { formatPretty } from "../../util/command/pretty.js";
import {
  assertTransformerDocument,
  assertRegistryFile,
  isRemoteSource,
  TRANSFORMERS_SCOPE,
  parseJsonObject,
  parseRegistryItem,
  registryDependencies,
  registryFiles,
  resolveTransformersFideDir,
  resolveRegistryDependency,
  resolveRegistryTarget,
  validateTransformerPathConvention,
  type InstalledTransformerSummary,
  type TransformerDocument,
  type RegistryItem,
} from "./shared.js";

export const transformersAddCommand = defineCommand({
  surface: "transformers.add",
  command: "fide transformers add",
  outputType: "TransformersAddOutput",
  summary: "Install a Fide transformer block or component from a shadcn-compatible registry item",
  usage: ["fide transformers add <registry-item-url-or-file> [--pretty|-p]"],
  paramOrder: ["pretty"],
  params: {
    pretty: { kind: "boolean", shorthand: "-p", description: "Human-readable output" },
  },
  examples: [
    "fide transformers add http://localhost:2996/r/fide-transformer-block-linkedin-profile.json",
    "fide transformers add apps/transformer-registry/public/r/fide-transformer-component-identity-named-entity.json",
  ],
  notes: [
    "Only registry:item documents with registry:file entries are supported.",
    "Registry file targets must be under ~/.fide/transformers/blocks or ~/.fide/transformers/components.",
    "~/.fide is resolved with FIDE_DIR and project .fide discovery, not the current project root.",
  ],
});

const TRANSFORMERS_ADD_PARSE_KEYS = mergeBooleanKeySets(booleanKeysFromCommand(transformersAddCommand));

export type TransformersAddOutput = {
  scope: typeof TRANSFORMERS_SCOPE;
  command: "fide transformers add";
  fideDir: string;
  source: string;
  installed: InstalledTransformerSummary[];
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
  installedByPath: Map<string, InstalledTransformerSummary>,
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
    const document = assertTransformerDocument(parsed, String(file.target ?? path));
    validateTransformerPathConvention(fideDir, path, document);
    const content = `${JSON.stringify(document, null, 2)}\n`;
    const rel = relative(fideDir, path).replace(/\\/g, "/");
    if (!rel || rel.startsWith("..")) {
      throw new Error(`Resolved transformer path is outside FIDE_DIR: ${path}`);
    }
    installFiles.push({ relativePath: rel, content });
    installedByPath.set(path, {
      transformerKey: document.transformerKey,
      kind,
      title: document.title,
      path,
    });
  }
}

export async function runTransformersAdd(args: string[]): Promise<number> {
  const { flags, positionals } = parseArgs(args, { booleanKeys: TRANSFORMERS_ADD_PARSE_KEYS });
  const useJson = !flags.has("pretty");
  if (flags.has("help")) {
    console.log(renderCommandHelp(transformersAddCommand));
    return 0;
  }

  const source = positionals[0];
  if (!source) throw new Error("Missing registry item URL or file path.");
  if (positionals.length > 1) throw new Error(`Unexpected extra arguments: ${positionals.slice(1).join(" ")}`);

  const fideDir = resolveTransformersFideDir();
  const seen = new Set<string>();
  const installedByPath = new Map<string, InstalledTransformerSummary>();
  const installFiles: { relativePath: string; content: string }[] = [];
  await installRegistryItem(source, fideDir, seen, installedByPath, installFiles);
  await postDaemonTransformersInstall(installFiles);

  const payload: TransformersAddOutput = {
    scope: TRANSFORMERS_SCOPE,
    command: "fide transformers add",
    fideDir,
    source,
    installed: [...installedByPath.values()].sort((a, b) => a.transformerKey.localeCompare(b.transformerKey)),
    dependencyCount: Math.max(0, seen.size - 1),
  };

  if (useJson) {
    printJson(payload);
  } else {
    console.log(formatPretty(TRANSFORMERS_SCOPE, payload));
  }
  return 0;
}
