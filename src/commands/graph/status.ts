import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { hasFlag, parseArgs } from "../../util/args.js";
import { printJson } from "../../util/io.js";
import { resolveFideDir } from "../../util/fide-dir.js";

/**
 * Report whether the current working directory has a `.fide` directory.
 *
 * Agent-first: JSON is always the default output format, even in TTY.
 */
export async function runGraphStatus(args: string[] = []): Promise<number> {
  const { flags } = parseArgs(args);
  if (hasFlag(flags, "help") || hasFlag(flags, "-h")) {
    console.log("Usage:\n  fide graph status [--target <path>]");
    return 0;
  }

  const { root, configuredFromSettings } = resolveFideDir(flags);
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
    dir: root,
    configuredFromSettings,
    fideDir,
    statementsDir,
    missing,
  };

  printJson(payload);
  return 0;
}
