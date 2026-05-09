import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { readJsonFile, resolveWorldModelConfigPath } from "./fide-dir.js";
import type { GraphStoreSettings } from "./project-settings.js";

export type LocalWorldModelRecord = GraphStoreSettings;

export function readLocalProjectWorldModel(
  worldModelKey: string,
  root: string = process.cwd(),
): LocalWorldModelRecord | null {
  return readJsonFile<LocalWorldModelRecord>(resolveWorldModelConfigPath(worldModelKey, root));
}

export async function writeLocalProjectWorldModel(
  worldModelKey: string,
  record: LocalWorldModelRecord,
  root: string = process.cwd(),
): Promise<string> {
  const configPath = resolveWorldModelConfigPath(worldModelKey, root);
  await mkdir(dirname(configPath), { recursive: true });
  await writeFile(configPath, `${JSON.stringify(record, null, 2)}\n`, "utf8");
  return configPath;
}
