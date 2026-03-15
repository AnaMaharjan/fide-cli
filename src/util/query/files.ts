import { readdir, readFile } from "node:fs/promises";
import { basename, extname, resolve } from "node:path";

export type LocalQueryDefinition = {
  statementStoreKey: string;
  name: string;
  description: string | null;
  sql: string;
  file: string;
};

export function resolveQueriesDir(root: string): string {
  return resolve(root, ".fide", "queries");
}

export function renderQueryFile(sql: string, description: string | null): string {
  const normalizedSql = sql.trim();
  const lines: string[] = [];
  if (description && description.trim().length > 0) {
    lines.push(`-- description: ${description.trim()}`);
    lines.push("");
  }
  lines.push(normalizedSql);
  return `${lines.join("\n")}\n`;
}

export function parseQueryFile(content: string): { description: string | null; sql: string } {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  let index = 0;
  let description: string | null = null;

  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      index += 1;
      continue;
    }
    const match = /^--\s*description\s*:\s*(.+)$/i.exec(trimmed);
    if (match) {
      description = match[1].trim() || null;
      index += 1;
      continue;
    }
    break;
  }

  const sql = lines.slice(index).join("\n").trim();
  if (!sql) {
    throw new Error("Query file is missing SQL body.");
  }
  return { description, sql };
}

async function listSqlFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const entryPath = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listSqlFiles(entryPath));
      continue;
    }
    if (entry.isFile() && extname(entry.name) === ".sql") {
      files.push(entryPath);
    }
  }
  return files.sort();
}

export async function readLocalQueries(root: string): Promise<LocalQueryDefinition[]> {
  const queriesDir = resolveQueriesDir(root);
  let storeDirs;
  try {
    storeDirs = await readdir(queriesDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const queries: LocalQueryDefinition[] = [];
  for (const storeDir of storeDirs) {
    if (!storeDir.isDirectory()) continue;
    const statementStoreKey = storeDir.name;
    const files = await listSqlFiles(resolve(queriesDir, statementStoreKey));
    for (const file of files) {
      const content = await readFile(file, "utf8");
      const parsed = parseQueryFile(content);
      queries.push({
        statementStoreKey,
        name: basename(file, ".sql"),
        description: parsed.description,
        sql: parsed.sql,
        file,
      });
    }
  }
  return queries;
}
