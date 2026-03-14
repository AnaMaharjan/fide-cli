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

function getGitignoreWarnings(
  paths: string[],
  options: { gitignore?: boolean | null } | undefined,
  describe: (path: string) => string,
): string[] {
  if (options?.gitignore === false) {
    return [];
  }

  const warnings: string[] = [];
  for (const path of paths) {
    if (!isWithinCwd(path)) {
      continue;
    }
    if (isExplicitlyGitignored(path)) {
      continue;
    }
    warnings.push(`${describe(path)} is not gitignored: ${relative(process.cwd(), path).replaceAll("\\", "/")} (set target.gitignore=false to suppress)`);
  }
  return warnings;
}

export function getSqliteWarnings(file: string, options?: { gitignore?: boolean | null }): string[] {
  return getGitignoreWarnings([file], options, () => "SQLite file");
}

export function getLocalWorkspaceWarnings(root: string, options?: { gitignore?: boolean | null }): string[] {
  return getGitignoreWarnings(
    [
      resolve(root, ".fide", "statements"),
      resolve(root, ".fide", "drafts"),
    ],
    options,
    () => "Local workspace path",
  );
}
