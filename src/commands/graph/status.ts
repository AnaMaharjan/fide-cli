import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { printJson } from "../../util/io.js";

/**
 * Report whether the current working directory has a `.fide` workspace.
 *
 * Agent-first: JSON is always the default output format, even in TTY.
 */
export async function runGraphStatus(): Promise<number> {
  const root = process.cwd();
  const fideDir = resolve(root, ".fide");
  const statementsDir = resolve(fideDir, "statements");

  const hasFide = existsSync(fideDir);
  const hasStatements = existsSync(statementsDir);
  const initialized = hasFide && hasStatements;

  const missing: string[] = [];
  if (!hasFide) missing.push(".fide");
  if (!hasStatements) missing.push(".fide/statements");

  const payload = {
    ok: true,
    initialized,
    root,
    fideDir,
    statementsDir,
    missing,
  };

  printJson(payload);
  return 0;
}

