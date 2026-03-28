import { readdir, readFile } from "node:fs/promises";
import { basename, extname, relative, resolve, sep } from "node:path";

export type QueryDefinition = {
  graphKey: string;
  name: string;
  description: string | null;
  sql: string;
};

export type LocalQueryDefinition = QueryDefinition & {
  file: string;
};

export function resolveQueriesDir(root: string): string {
  return resolve(root, ".fide", "graphs");
}

export function resolveGraphQueriesDir(root: string, graphKey: string): string {
  return resolve(resolveQueriesDir(root), graphKey, "queries");
}

export function parseLocalQueryFilePath(root: string, file: string): {
  graphKey: string;
  name: string;
} {
  const queriesRoot = resolveQueriesDir(root);
  const relativePath = relative(queriesRoot, file);
  const pathSegments = relativePath.split(sep).filter(Boolean);
  const graphKey = pathSegments[0] ?? null;
  const queriesSegment = pathSegments[1] ?? null;
  if (!graphKey || queriesSegment !== "queries") {
    throw new Error(`Query file must live under .fide/graphs/<graph>/queries/: ${file}`);
  }
  return {
    graphKey,
    name: basename(file, ".sql"),
  };
}

export function renderQueryFile(sql: string, options: { description: string | null; graphKey: string }): string {
  void options.graphKey;
  const normalizedSql = sql.trim();
  const description = options.description?.trim() ?? "";
  const lines: string[] = [`-- description: ${description}`, ""];
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
    const match = /^--\s*description\s*:\s*(.*)$/i.exec(trimmed);
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
  let files;
  try {
    files = await listSqlFiles(queriesDir);
  } catch {
    return [];
  }

  const queries: LocalQueryDefinition[] = [];
  for (const file of files) {
    const content = await readFile(file, "utf8");
    const parsed = parseQueryFile(content);
    const { graphKey } = parseLocalQueryFilePath(root, file);
    queries.push({
      graphKey,
      name: basename(file, ".sql"),
      description: parsed.description,
      sql: parsed.sql,
      file,
    });
  }
  return queries;
}
