import { existsSync, readdirSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { GraphStoreSettings } from "@chris-test/graph";
import { readJsonFile, resolveFideContext, resolveGraphConfigPath, resolveGraphsDir } from "./fide-dir.js";

export type LocalProjectGraphRecord = GraphStoreSettings;

export function readLocalProjectGraph(graphKey: string, root: string = process.cwd()): LocalProjectGraphRecord | null {
  return readJsonFile<LocalProjectGraphRecord>(resolveGraphConfigPath(graphKey, root));
}

export function listLocalProjectGraphs(root: string = process.cwd()): {
  root: string;
  graphs: Array<{ graphKey: string; graph: LocalProjectGraphRecord }>;
} {
  const graphsDir = resolveGraphsDir(root);
  const fide = resolveFideContext(root);
  if (!existsSync(graphsDir)) {
    return { root: fide.root, graphs: [] };
  }

  const graphs = readdirSync(graphsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => {
      const graph = readLocalProjectGraph(entry.name, root);
      return graph ? [{ graphKey: entry.name, graph }] : [];
    });

  return {
    root: fide.root,
    graphs,
  };
}

export async function writeLocalProjectGraph(
  graphKey: string,
  graph: LocalProjectGraphRecord,
  root: string = process.cwd(),
): Promise<string> {
  const configPath = resolveGraphConfigPath(graphKey, root);
  await mkdir(dirname(configPath), { recursive: true });
  await writeFile(configPath, `${JSON.stringify(graph, null, 2)}\n`, "utf8");
  return configPath;
}
