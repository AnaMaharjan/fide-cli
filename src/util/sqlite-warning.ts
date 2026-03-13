import { existsSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";

function isWithinCwd(file: string): boolean {
  const rel = relative(process.cwd(), file);
  return rel !== ".." && !rel.startsWith("../") && rel !== "" && !rel.startsWith("..\\");
}

function isExplicitlyGitignored(file: string): boolean {
  const gitignorePath = resolve(process.cwd(), ".gitignore");
  if (!existsSync(gitignorePath)) return false;
  const rel = relative(process.cwd(), file).replaceAll("\\", "/");
  if (!rel || rel === ".") return false;
  const lines = readFileSync(gitignorePath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));
  return lines.includes(rel);
}

export function getSqliteWarnings(file: string, options?: { gitignore?: boolean | null }): string[] {
  if (options?.gitignore === false) {
    return [];
  }
  if (!isWithinCwd(file)) {
    return [];
  }
  if (isExplicitlyGitignored(file)) {
    return [];
  }
  return [
    `SQLite file is not gitignored: ${relative(process.cwd(), file).replaceAll("\\", "/")} (set target.gitignore=false to suppress)`,
  ];
}
