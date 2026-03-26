import { readFile } from "node:fs/promises";
import { resolvePluginManifestPath } from "./paths.js";

export type FidePluginManifest = {
  id: string;
  name?: string;
  version: string;
  capabilities?: Record<string, unknown>;
  source?: {
    type: "local";
    path: string;
  };
};

export async function readPluginManifest(pluginRoot: string): Promise<FidePluginManifest> {
  const raw = await readFile(resolvePluginManifestPath(pluginRoot), "utf8");
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  if (typeof parsed.id !== "string" || parsed.id.trim().length === 0) {
    throw new Error(`Invalid plugin manifest at ${pluginRoot}: missing non-empty id.`);
  }
  if (typeof parsed.version !== "string" || parsed.version.trim().length === 0) {
    throw new Error(`Invalid plugin manifest at ${pluginRoot}: missing non-empty version.`);
  }
  return {
    id: parsed.id.trim(),
    ...(typeof parsed.name === "string" && parsed.name.trim().length > 0 ? { name: parsed.name.trim() } : {}),
    version: parsed.version.trim(),
    ...(parsed.capabilities && typeof parsed.capabilities === "object"
      ? { capabilities: parsed.capabilities as Record<string, unknown> }
      : {}),
  };
}
