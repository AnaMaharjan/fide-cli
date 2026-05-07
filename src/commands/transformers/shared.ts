import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolveFideDir } from "../../lib/project/config/fide-dir.js";

export const TRANSFORMERS_SCOPE = "transformers.v1";
export type TransformerKind = "block" | "component";

export type InstalledTransformerSummary = {
  transformerKey: string;
  kind: TransformerKind;
  title: string;
  path: string;
};

export type ValidationIssue = {
  path: string;
  message: string;
};

export type TransformerDocument = {
  version: unknown;
  transformerKey: string;
  title: string;
  uses?: Array<{ component?: unknown }>;
  [key: string]: unknown;
};

export type RegistryFile = {
  type?: unknown;
  target?: unknown;
  content?: unknown;
  path?: unknown;
};

export type RegistryItem = {
  name?: unknown;
  type?: unknown;
  title?: unknown;
  registryDependencies?: unknown;
  files?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function resolveTransformersFideDir(): string {
  return resolveFideDir();
}

export function isTransformerKind(value: string | null): value is TransformerKind {
  return value === "block" || value === "component";
}

export function kindFromTransformerKey(transformerKey: string): TransformerKind | null {
  if (transformerKey.startsWith("blocks.")) return "block";
  if (transformerKey.startsWith("components.")) return "component";
  return null;
}

export function kindDir(kind: TransformerKind): "blocks" | "components" {
  return kind === "block" ? "blocks" : "components";
}

export function transformerKeyToRelativePath(transformerKey: string): string {
  const kind = kindFromTransformerKey(transformerKey);
  if (!kind) throw new Error(`Unsupported transformerKey prefix: ${transformerKey}. Expected blocks.* or components.*.`);
  const prefix = kind === "block" ? "blocks." : "components.";
  const rest = transformerKey.slice(prefix.length);
  if (!rest || rest.split(".").some((part) => part.length === 0 || part === "." || part === ".." || part.includes("/") || part.includes("\\"))) {
    throw new Error(`Invalid transformerKey path segments: ${transformerKey}.`);
  }
  return join("transformers", kindDir(kind), ...rest.split(".")) + ".json";
}

export function resolveTransformerKeyPath(fideDir: string, transformerKey: string): string {
  return resolve(fideDir, transformerKeyToRelativePath(transformerKey));
}

function assertUnder(parent: string, child: string, label: string): void {
  const rel = relative(parent, child);
  if (rel === "" || (!rel.startsWith("..") && !isAbsolute(rel))) return;
  throw new Error(`${label} resolves outside ${parent}.`);
}

export function resolveRegistryTarget(fideDir: string, target: unknown): { path: string; kind: TransformerKind } {
  if (typeof target !== "string" || target.trim().length === 0) {
    throw new Error("Registry file is missing a string target.");
  }
  if (isAbsolute(target)) {
    throw new Error(`Registry target must not be absolute: ${target}.`);
  }
  if (!target.startsWith("~/.fide/transformers/")) {
    throw new Error(`Registry target must be under ~/.fide/transformers/blocks or ~/.fide/transformers/components: ${target}.`);
  }

  const suffix = target.slice("~/.fide/".length);
  const parts = suffix.split(/[\\/]+/u);
  if (parts.some((part) => part === ".." || part === "." || part.length === 0)) {
    throw new Error(`Registry target contains invalid path segments: ${target}.`);
  }
  if (parts[0] !== "transformers" || (parts[1] !== "blocks" && parts[1] !== "components")) {
    throw new Error(`Registry target must be under ~/.fide/transformers/blocks or ~/.fide/transformers/components: ${target}.`);
  }
  if (!target.endsWith(".json")) {
    throw new Error(`Registry target must be a JSON transformer file: ${target}.`);
  }

  const path = resolve(fideDir, ...parts);
  assertUnder(resolve(fideDir, "transformers"), path, "Registry target");
  return { path, kind: parts[1] === "blocks" ? "block" : "component" };
}

export function parseJsonObject(content: string, path: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid JSON in ${path}: ${message}`);
  }
  if (!isRecord(parsed)) {
    throw new Error(`Transformer JSON must be an object: ${path}.`);
  }
  return parsed;
}

export function assertTransformerDocument(value: unknown, path: string): TransformerDocument {
  if (!isRecord(value)) {
    throw new Error(`Transformer JSON must be an object: ${path}.`);
  }
  if (!("version" in value)) {
    throw new Error(`Transformer JSON is missing required field version: ${path}.`);
  }
  if (typeof value.transformerKey !== "string" || value.transformerKey.trim().length === 0) {
    throw new Error(`Transformer JSON is missing required field transformerKey: ${path}.`);
  }
  if (typeof value.title !== "string" || value.title.trim().length === 0) {
    throw new Error(`Transformer JSON is missing required field title: ${path}.`);
  }
  return value as TransformerDocument;
}

export function validateTransformerPathConvention(fideDir: string, path: string, document: TransformerDocument): void {
  const expected = resolveTransformerKeyPath(fideDir, document.transformerKey);
  if (resolve(path) !== expected) {
    throw new Error(`transformerKey ${document.transformerKey} must be installed at ${expected}, not ${path}.`);
  }
}

export async function readTransformerDocument(path: string): Promise<TransformerDocument> {
  const content = await readFile(path, "utf8");
  return assertTransformerDocument(parseJsonObject(content, path), path);
}

export async function writeTransformerDocument(path: string, document: TransformerDocument): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(document, null, 2)}\n`, "utf8");
}

export async function removeTransformerDocument(path: string): Promise<boolean> {
  if (!existsSync(path)) return false;
  await rm(path);
  return true;
}

async function walkJsonFiles(dir: string): Promise<string[]> {
  if (!existsSync(dir)) return [];
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const path = resolve(dir, entry.name);
    if (entry.isDirectory()) return walkJsonFiles(path);
    return entry.isFile() && entry.name.endsWith(".json") ? [path] : [];
  }));
  return files.flat();
}

export async function listTransformerFiles(fideDir: string, kind?: TransformerKind): Promise<Array<{ path: string; kind: TransformerKind }>> {
  const kinds: TransformerKind[] = kind ? [kind] : ["block", "component"];
  const files = await Promise.all(kinds.map(async (currentKind) => {
    const dir = resolve(fideDir, "transformers", kindDir(currentKind));
    return (await walkJsonFiles(dir)).map((path) => ({ path, kind: currentKind }));
  }));
  return files.flat().sort((a, b) => a.path.localeCompare(b.path));
}

export async function readInstalledTransformerSummaries(fideDir: string, kind?: TransformerKind): Promise<InstalledTransformerSummary[]> {
  const summaries = await Promise.all((await listTransformerFiles(fideDir, kind)).map(async ({ path, kind: currentKind }) => {
    const document = await readTransformerDocument(path);
    return {
      transformerKey: document.transformerKey,
      kind: currentKind,
      title: document.title,
      path,
    };
  }));
  return summaries.sort((a, b) => a.transformerKey.localeCompare(b.transformerKey));
}

export function registryDependencies(item: RegistryItem): string[] {
  if (item.registryDependencies === undefined) return [];
  if (!Array.isArray(item.registryDependencies)) {
    throw new Error("registryDependencies must be an array when present.");
  }
  return item.registryDependencies.map((entry) => {
    if (typeof entry !== "string" || entry.trim().length === 0) {
      throw new Error("registryDependencies entries must be non-empty strings.");
    }
    return entry;
  });
}

export function registryFiles(item: RegistryItem): RegistryFile[] {
  if (!Array.isArray(item.files)) return [];
  return item.files.map((file) => {
    if (!isRecord(file)) throw new Error("Registry files entries must be objects.");
    return file;
  });
}

export function assertRegistryFile(file: RegistryFile): asserts file is RegistryFile & { type: "registry:file"; content: string } {
  if (file.type !== "registry:file") {
    throw new Error(`Unsupported registry file type: ${String(file.type)}. Only registry:file is supported.`);
  }
  if (typeof file.content !== "string") {
    throw new Error(`Registry file is missing embedded content for target ${String(file.target ?? file.path ?? "unknown")}.`);
  }
}

export function parseRegistryItem(content: string, source: string): RegistryItem {
  const parsed = parseJsonObject(content, source);
  if (parsed.type !== "registry:item") {
    throw new Error(`Unsupported registry item type in ${source}: ${String(parsed.type)}. Expected registry:item.`);
  }
  return parsed;
}

export function isRemoteSource(source: string): boolean {
  return source.startsWith("http://") || source.startsWith("https://");
}

export function resolveRegistryDependency(source: string, dependency: string): string {
  if (isRemoteSource(dependency)) return dependency;
  if (isRemoteSource(source)) return new URL(dependency, source).toString();
  return fileURLToPath(new URL(dependency, pathToFileURL(resolve(dirname(source)) + sep)));
}
