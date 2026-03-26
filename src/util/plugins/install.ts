import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import type { FidePluginManifest } from "./manifest.js";
import { readPluginManifest } from "./manifest.js";
import {
  resolveInstalledPluginDir,
  resolveLocalPluginSource,
  resolvePluginManifestPath,
  resolvePluginsDir,
} from "./paths.js";

export async function installLocalPluginSource(source: string, options?: {
  id?: string;
}): Promise<{
  source: string;
  pluginRoot: string;
  installDir: string;
  manifest: FidePluginManifest;
}> {
  const pluginRoot = resolveLocalPluginSource(source);
  const manifest = await readPluginManifest(pluginRoot);
  const installedManifest: FidePluginManifest = {
    ...manifest,
    ...(options?.id ? { id: options.id } : {}),
    source: {
      type: "local",
      path: pluginRoot,
    },
  };
  const installDir = resolveInstalledPluginDir(installedManifest.id);

  await mkdir(resolvePluginsDir(), { recursive: true });
  await rm(installDir, { recursive: true, force: true });
  await cp(pluginRoot, installDir, { recursive: true });
  await writeFile(
    resolvePluginManifestPath(installDir),
    `${JSON.stringify(installedManifest, null, 2)}\n`,
    "utf8",
  );

  return {
    source,
    pluginRoot,
    installDir,
    manifest: installedManifest,
  };
}
