import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

function batchDateInRange(batchDate: string, fromDate?: string, toDate?: string): boolean {
  if (fromDate && batchDate < fromDate) return false;
  if (toDate && batchDate > toDate) return false;
  return true;
}

/** `_meta.json` paths under `statementsDir/YYYY/MM/DD/` limited by the same inclusive date rules as statement batch listing. */
export async function listStatementsDayMetaPaths(
  statementsDir: string,
  options: { fromDate?: string; toDate?: string } = {},
): Promise<string[]> {
  const out: string[] = [];
  let years: string[];
  try {
    years = (await readdir(statementsDir, { withFileTypes: true }))
      .filter((e) => e.isDirectory() && /^\d{4}$/u.test(e.name))
      .map((e) => e.name)
      .sort();
  } catch {
    return [];
  }
  for (const y of years) {
    const yPath = join(statementsDir, y);
    const months = (await readdir(yPath, { withFileTypes: true }))
      .filter((e) => e.isDirectory() && /^\d{2}$/u.test(e.name))
      .map((e) => e.name)
      .sort();
    for (const m of months) {
      const mPath = join(yPath, m);
      const days = (await readdir(mPath, { withFileTypes: true }))
        .filter((e) => e.isDirectory() && /^\d{2}$/u.test(e.name))
        .map((e) => e.name)
        .sort();
      for (const d of days) {
        const batchDate = `${y}-${m}-${d}`;
        if (!batchDateInRange(batchDate, options.fromDate, options.toDate)) continue;
        out.push(join(mPath, d, "_meta.json"));
      }
    }
  }
  return out;
}

function addPendingReplacementRoots(pending: unknown, superseded: Set<string>): void {
  if (typeof pending === "string" && pending.length > 0) {
    superseded.add(pending);
    return;
  }
  if (Array.isArray(pending)) {
    for (const item of pending) {
      if (typeof item === "string" && item.length > 0) {
        superseded.add(item);
      }
    }
  }
}

export async function collectSupersededRootsFromStatementsDayMeta(
  statementsDir: string,
  options: { fromDate?: string; toDate?: string } = {},
): Promise<Set<string>> {
  const superseded = new Set<string>();
  for (const metaPath of await listStatementsDayMetaPaths(statementsDir, options)) {
    let doc: unknown;
    try {
      doc = JSON.parse(await readFile(metaPath, "utf8"));
    } catch {
      continue;
    }
    if (!doc || typeof doc !== "object") continue;
    for (const entry of Object.values(doc as Record<string, unknown>)) {
      if (!entry || typeof entry !== "object") continue;
      const pending = (entry as Record<string, unknown>).sourceDraftRootPendingReplacement;
      addPendingReplacementRoots(pending, superseded);
    }
  }
  return superseded;
}

/** Sets `sourceDraftRootPendingReplacement` to `null` on every entry that had a non-null value. */
export async function clearSourceDraftRootPendingReplacementInMetaFile(metaPath: string): Promise<boolean> {
  let raw: string;
  try {
    raw = await readFile(metaPath, "utf8");
  } catch {
    return false;
  }
  let doc: unknown;
  try {
    doc = JSON.parse(raw);
  } catch {
    return false;
  }
  if (!doc || typeof doc !== "object") return false;
  let changed = false;
  for (const entry of Object.values(doc as Record<string, unknown>)) {
    if (!entry || typeof entry !== "object") continue;
    const rec = entry as Record<string, unknown>;
    if ("sourceDraftRootPendingReplacement" in rec && rec.sourceDraftRootPendingReplacement != null) {
      rec.sourceDraftRootPendingReplacement = null;
      changed = true;
    }
  }
  if (changed) {
    await writeFile(metaPath, `${JSON.stringify(doc, null, 2)}\n`);
  }
  return changed;
}
