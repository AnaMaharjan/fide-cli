import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join } from "node:path";

type FideJsonlInspection = {
  reachable: boolean;
  initialized: boolean;
  missing: string[];
  error?: string;
  fileCount?: number;
};

async function listJsonlFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listJsonlFiles(fullPath));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".jsonl")) {
      files.push(fullPath);
    }
  }
  return files.sort();
}

export async function inspectFideJsonlStore(dir: string): Promise<FideJsonlInspection> {
  if (!existsSync(dir)) {
    return {
      reachable: false,
      initialized: false,
      missing: [dir],
    };
  }

  try {
    const files = await listJsonlFiles(dir);
    return {
      reachable: true,
      initialized: true,
      missing: [],
      fileCount: files.length,
    };
  } catch (error) {
    return {
      reachable: false,
      initialized: false,
      missing: [dir],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
