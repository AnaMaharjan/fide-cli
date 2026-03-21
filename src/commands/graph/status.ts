import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { hasFlag, parseArgs } from "../../util/args.js";
import { renderCommandHelp } from "../../util/command-metadata.js";
import { printJson } from "../../util/io.js";
import { resolveGraphTarget, resolveStoreTarget } from "../../util/graph/target.js";
import { getLocalFideWarnings } from "../../util/graph/local-disk-warning.js";
import { graphStatusCommand } from "./metadata.js";
import { getQueryStoreStatus, getRuntimeStatusOverview, getStatementStoreStatus } from "../store/status.js";

export async function runGraphStatus(args: string[] = []): Promise<number> {
  const { flags, positionals } = parseArgs(args);
  if (hasFlag(flags, "help") || hasFlag(flags, "-h")) {
    console.log(renderCommandHelp(graphStatusCommand));
    return 0;
  }

  if (positionals.length > 0) {
    throw new Error("`graph status` does not accept positional arguments.");
  }

  const statementStore = typeof flags.get("statement-store") === "string" ? String(flags.get("statement-store")) : null;
  const queryStore = typeof flags.get("query-store") === "string" ? String(flags.get("query-store")) : null;
  const hasFideDir = flags.has("fide-dir");

  if (statementStore && queryStore) {
    throw new Error("Pass either `--statement-store` or `--query-store`, not both.");
  }
  if ((statementStore || queryStore) && hasFideDir) {
    throw new Error("`--fide-dir` only applies to local status. Omit it when targeting a configured store.");
  }

  if (statementStore) {
    const targetFlags = new Map<string, string | boolean>([["statement-store", statementStore]]);
    printJson({
      ok: true,
      statementStore: await getStatementStoreStatus(resolveStoreTarget(targetFlags)),
    });
    return 0;
  }

  if (queryStore) {
    printJson({
      ok: true,
      queryStore: await getQueryStoreStatus(queryStore),
    });
    return 0;
  }

  const graphTarget = resolveGraphTarget(flags);
  if (graphTarget.type !== "local") {
    throw new Error("`fide graph status` could not resolve a local .fide directory.");
  }

  const { root, configuredFromSettings } = graphTarget;
  const fideDir = resolve(root, ".fide");
  const statementsDir = resolve(fideDir, "statements");
  const hasFide = existsSync(fideDir);
  const hasStatements = existsSync(statementsDir);

  const missing: string[] = [];
  if (!hasFide) missing.push(".fide");

  const local = {
    configured: true,
    next: {
      writeHelpCommand: "fide graph write -h",
      writeCommand: "fide graph write ...",
    },
    root,
    connection: graphTarget.connection ?? root,
    configuredFromSettings,
    fideDir,
    statementsDir,
    statementsDirPresent: hasStatements,
    missing,
    key: graphTarget.key,
    warnings: getLocalFideWarnings(root, { gitignore: graphTarget.gitignore }),
  };

  printJson({
    ok: true,
    local,
    ...(await getRuntimeStatusOverview()),
  });
  return 0;
}
