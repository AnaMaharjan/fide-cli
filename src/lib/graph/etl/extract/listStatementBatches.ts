import { readFile, readdir } from "node:fs/promises";
import { basename, dirname, join, relative, resolve } from "node:path";

export type StatementBatchCandidate = {
  file: string;
  root: string;
  batchDate: string | null;
  title?: string;
  description?: string;
};

type StatementsDayMetaEntry = {
  sourceDraftTitle?: string;
  sourceDraftDescription?: string;
};

type StatementsDayMeta = Record<string, StatementsDayMetaEntry>;

function extractBatchDate(statementsDir: string, file: string): string | null {
  const rel = relative(statementsDir, file).replaceAll("\\", "/");
  const match = /^(\d{4})\/(\d{2})\/(\d{2})\//.exec(rel);
  if (!match) return null;
  return `${match[1]}-${match[2]}-${match[3]}`;
}

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

export async function listStatementBatchCandidates(
  statementsDir: string,
  options: { fromDate?: string; toDate?: string } = {},
): Promise<StatementBatchCandidate[]> {
  const files = await listJsonlFiles(statementsDir);
  const metaByDir = new Map<string, StatementsDayMeta>();
  const candidates = await Promise.all(files.map(async (file) => {
    const candidate = {
      file,
      root: basename(file, ".jsonl"),
      batchDate: extractBatchDate(statementsDir, file),
    };
    const dir = dirname(candidate.file);
    let meta = metaByDir.get(dir);
    if (!meta) {
      try {
        meta = JSON.parse(await readFile(resolve(dir, "_meta.json"), "utf8")) as StatementsDayMeta;
      } catch {
        meta = {};
      }
      metaByDir.set(dir, meta);
    }
    const entry = meta[candidate.root];
    return {
      ...candidate,
      ...(entry?.sourceDraftTitle ? { title: entry.sourceDraftTitle } : {}),
      ...(entry?.sourceDraftDescription ? { description: entry.sourceDraftDescription } : {}),
    };
  }));
  return candidates.filter((candidate) => {
      if (options.fromDate && candidate.batchDate && candidate.batchDate < options.fromDate) return false;
      if (options.toDate && candidate.batchDate && candidate.batchDate > options.toDate) return false;
      return true;
    });
}
