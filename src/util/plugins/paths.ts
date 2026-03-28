import { homedir } from "node:os";
import { basename, isAbsolute, join, resolve } from "node:path";
import { resolveFideDir } from "../../lib/project/config/fide-dir.js";

export function resolvePluginsDir(root: string = process.cwd()): string {
  return join(resolveFideDir(root), "plugins");
}

export function normalizePluginIdForPath(id: string): string {
  return id.replace(/[\\/]/g, "__");
}

export function resolveInstalledPluginDir(id: string, root: string = process.cwd()): string {
  return join(resolvePluginsDir(root), normalizePluginIdForPath(id));
}

export function resolvePluginManifestPath(root: string): string {
  return join(root, "plugin.json");
}

export function isLikelyLocalPluginSource(source: string): boolean {
  return source.startsWith(".")
    || source.startsWith("/")
    || source.startsWith("~")
    || source.includes("/");
}

export function resolveLocalPluginSource(source: string): string {
  if (source.startsWith("~")) {
    return resolve(homedir(), source.slice(1));
  }
  return isAbsolute(source) ? source : resolve(process.cwd(), source);
}

export function suggestPluginInstallDir(id: string): string {
  return basename(resolveInstalledPluginDir(id));
}
