import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { inspectGraphStore, inspectQueryStore } from "@chris-test/graph-db";
import { hasFlag, parseArgs } from "../../util/args.js";
import { renderCommandHelp } from "../../util/command-metadata.js";
import { printJson } from "../../util/io.js";
import {
  getLocalFideWarnings,
  inspectFideJsonlStore,
  listConfiguredQueryStoreKeys,
  listConfiguredStoreTargetKeys,
  resolveGraphTarget,
  resolveQueryStore,
  resolveStoreTarget,
} from "@chris-test/graph";
import { getSqliteWarnings } from "../../util/graph/local-disk-warning.js";
import { graphStatusCommand } from "./metadata.js";

function nextCommands(key: string | null, recipe: unknown, storeType?: "postgres" | "sqlite" | "fide-jsonl"): Record<string, string> | undefined {
  if (!key) return undefined;
  if (storeType === "fide-jsonl") {
    return {
      writeHelpCommand: "fide graph statements write -h",
      writeCommand: "fide graph statements write ...",
    };
  }
  const next: Record<string, string> = {
    queryHelpCommand: "fide graph query run -h",
    queryCommand: `fide graph query run --graph ${key} ...`,
  };
  if (Array.isArray(recipe) && recipe.length > 0) {
    next.buildHelpCommand = "fide graph build -h";
    next.buildCommand = `fide graph build --graph ${key}`;
  }
  return next;
}

async function getStatementStoreStatus(target: ReturnType<typeof resolveStoreTarget>) {
  if (target.type === "fide-jsonl") {
    const inspection = await inspectFideJsonlStore(target.dir);
    return {
      ok: true,
      storeType: "fide-jsonl" as const,
      key: target.key,
      configured: true,
      reachable: inspection.reachable,
      dir: target.dir,
      recipe: target.recipe,
      lastRunAt: target.runState?.metadata?.lastRunAt,
      lastRunStatementsAdded: target.runState?.metadata?.lastRunStatementsAdded,
      next: nextCommands(target.key, target.recipe, "fide-jsonl"),
      missing: inspection.missing,
      error: inspection.error,
    };
  }

  const inspection = await inspectGraphStore(target);
  return {
    ...inspection,
    next: nextCommands(target.key, target.recipe, target.type),
    warnings: target.type === "sqlite" ? getSqliteWarnings(target.file, { gitignore: target.gitignore }) : undefined,
  };
}

async function getQueryStoreStatus(key: string) {
  const store = resolveQueryStore(new Map<string, string | boolean>([["query-store", key]]));
  const inspection = await inspectQueryStore(store);
  return {
    ...inspection,
    next: {
      buildHelpCommand: "fide graph build -h",
      buildCommand: `fide graph build --query-store ${store.key}`,
    },
  };
}

async function getRuntimeStatusOverview() {
  const configuredKeys = listConfiguredStoreTargetKeys();
  const graphs = await Promise.all(configuredKeys.map(async (key) => {
    const resolved = resolveStoreTarget(new Map<string, string | boolean>([["graph", key]]));
    const detailed = await getStatementStoreStatus(resolved);
    return {
      key,
      storeType: detailed.storeType,
      warnings: "warnings" in detailed ? detailed.warnings : undefined,
      next: {
        statusCommand: `fide graph status --graph ${key}`,
        ...(("storeType" in detailed && detailed.storeType === "fide-jsonl")
          ? {
              writeHelpCommand: "fide graph statements write -h",
              writeCommand: "fide graph statements write ...",
            }
          : {
              queryHelpCommand: "fide graph query run -h",
              queryCommand: `fide graph query run --graph ${key} ...`,
            }),
        ...(Array.isArray((detailed as { recipe?: unknown }).recipe) && (detailed as { recipe?: unknown[] }).recipe!.length > 0 && detailed.storeType !== "fide-jsonl"
          ? {
              buildHelpCommand: "fide graph build -h",
              buildCommand: `fide graph build --graph ${key}`,
            }
          : {}),
      },
    };
  }));

  const queryStoreKeys = listConfiguredQueryStoreKeys();
  const queryStores = await Promise.all(queryStoreKeys.map(async (key) => {
    const detailed = await getQueryStoreStatus(key);
    return {
      key,
      storeType: detailed.storeType,
      next: detailed.next,
    };
  }));

  return {
    graphs,
    queryStores,
  };
}

export async function runGraphStatus(args: string[] = []): Promise<number> {
  const { flags, positionals } = parseArgs(args);
  if (hasFlag(flags, "help") || hasFlag(flags, "-h")) {
    console.log(renderCommandHelp(graphStatusCommand));
    return 0;
  }

  if (positionals.length > 0) {
    throw new Error("`graph status` does not accept positional arguments.");
  }

  const statementStore = typeof flags.get("graph") === "string" ? String(flags.get("graph")) : null;
  const queryStore = typeof flags.get("query-store") === "string" ? String(flags.get("query-store")) : null;
  const hasFideDir = flags.has("fide-dir");

  if (statementStore && queryStore) {
    throw new Error("Pass either `--graph` or `--query-store`, not both.");
  }
  if ((statementStore || queryStore) && hasFideDir) {
    throw new Error("`--fide-dir` only applies to local status. Omit it when targeting a configured store.");
  }

  if (statementStore) {
    const targetFlags = new Map<string, string | boolean>([["graph", statementStore]]);
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
      writeHelpCommand: "fide graph statements write -h",
      writeCommand: "fide graph statements write ...",
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
