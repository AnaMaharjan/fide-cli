import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { hasFlag, parseArgs } from "../../util/args.js";
import { printJson } from "../../util/io.js";
import { resolveGraphTarget } from "../../util/graph-target.js";

/**
 * Report whether the current working directory has a `.fide` directory.
 *
 * Agent-first: JSON is always the default output format, even in TTY.
 */
export async function runGraphStatus(args: string[] = []): Promise<number> {
  const { flags } = parseArgs(args);
  if (hasFlag(flags, "help") || hasFlag(flags, "-h")) {
    console.log("Usage:\n  fide graph status [--target <key-or-path>]");
    return 0;
  }

  const graphTarget = resolveGraphTarget(flags);
  if (graphTarget.type === "postgres") {
    printJson({
      ok: true,
      target: "postgres",
      key: graphTarget.key,
      configuredFromSettings: graphTarget.configuredFromSettings,
      databaseUrlConfigured: Boolean(graphTarget.databaseUrl),
      databaseUrlSource: graphTarget.databaseUrlSource,
      databaseUrlEnv: graphTarget.databaseUrlEnv,
      schema: graphTarget.schema,
      statementsTable: graphTarget.statementsTable,
      initialized: Boolean(graphTarget.databaseUrl),
      missing: graphTarget.databaseUrl ? [] : ["postgres.databaseUrl"],
    });
    return 0;
  }

  const { root, configuredFromSettings } = graphTarget;
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
    target: "local",
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
