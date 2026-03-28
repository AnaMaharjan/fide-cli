import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { hasFlag, parseArgs, shouldUseJsonOutput } from "../../util/command/args.js";
import {
  booleanKeysFromCommand,
  defineCommand,
  mergeBooleanKeySets,
  renderCommandHelp,
} from "../../util/command/command-metadata.js";
import { printJson } from "../../util/command/io.js";
import { formatPretty } from "../../util/command/pretty.js";
import { assertGraphKey } from "../../util/ids/selectors.js";
import { createPgClient } from "../../lib/graph/clients/postgres.js";
import { inspectSqliteGraph } from "../../lib/graph/clients/sqlite.js";
import { inspectFideJsonlStore } from "../../lib/project/fide-jsonl.js";
import { listConfiguredStoreTargetKeys, resolveGraphTarget, resolveStoreTarget } from "../../lib/project/config/project-settings.js";
import { getLocalFideWarnings } from "../../lib/project/warnings/local-warnings.js";
export const graphStatusCommand = defineCommand({
  surface: "graph.status",
  command: "fide graph status",
  outputType: "GraphStatusOutput",
  summary: "Inspect local graph state and configured runtime status",
  usage: [
    "fide graph status",
    "fide graph status --graph-key <key>",
  ],
  paramOrder: ["graph-key", "pretty"],
  params: {
    "graph-key": { kind: "string", description: "Configured graph key", valueLabel: "<key>" },
    pretty: { kind: "boolean", shorthand: "-p", description: "Human-readable output" },
  },
  notes: [
    "With no selector, also returns local `.fide` status.",
  ],
});

const GRAPH_STATUS_PARSE_KEYS = mergeBooleanKeySets(booleanKeysFromCommand(graphStatusCommand));

export type GraphStatusOutput = {
  ok: true;
  scope: "graph-status.v1";
  local: Record<string, unknown> | null;
  graphs: unknown[];
};

function nextCommands(key: string | null, graphStoreType?: "postgres" | "sqlite" | "fide-jsonl"): Record<string, string> | undefined {
  if (!key) return undefined;
  if (graphStoreType === "fide-jsonl") {
    return {
      writeHelpCommand: "fide statements write -h",
      writeCommand: "fide statements write ...",
    };
  }
  return {
    queryHelpCommand: "fide query run -h",
    queryCommand: `fide query run --graph-key ${key} ... --to-fide-path results/rows.json`,
  };
}

async function getGraphStatus(target: ReturnType<typeof resolveStoreTarget>) {
  if (target.type === "fide-jsonl") {
    const inspection = await inspectFideJsonlStore(target.dir);
    return {
      ok: true,
      graphStoreType: "fide-jsonl" as const,
      key: target.key,
      configured: true,
      reachable: inspection.reachable,
      dir: target.dir,
      next: nextCommands(target.key, "fide-jsonl"),
      missing: inspection.missing,
      error: inspection.error,
    };
  }

  const inspection = await inspectGraphStore(target);
  return {
    ...inspection,
    next: nextCommands(target.key, target.type),
  };
}

async function inspectGraphStore(target: ReturnType<typeof resolveStoreTarget>) {
  if (target.type === "fide-jsonl") {
    throw new Error("inspectGraphStore does not support fide-jsonl stores.");
  }

  if (target.type === "sqlite") {
    const inspection = await inspectSqliteGraph(target.file);
    return {
      ok: true,
      graphStoreType: "sqlite" as const,
      key: target.key,
      configured: true,
      reachable: inspection.reachable,
      file: target.file,
      missing: inspection.missing,
      error: inspection.error,
    };
  }

  if (!target.databaseUrl) {
    return {
      ok: true,
      graphStoreType: "postgres" as const,
      key: target.key,
      configuredFromSettings: target.configuredFromSettings,
      databaseUrlConfigured: false,
      databaseUrlSource: target.databaseUrlSource,
      databaseUrlEnv: target.databaseUrlEnv,
      schema: target.schema,
      reachable: false,
      missing: ["postgres.connection"],
    };
  }

  const expectedReferenceIdentifierColumns = ["identifier_fingerprint", "reference_identifier"];
  const expectedStatementsColumns = [
    "statement_fingerprint",
    "subject_type",
    "subject_reference_type",
    "subject_fingerprint",
    "predicate_fingerprint",
    "object_type",
    "object_reference_type",
    "object_fingerprint",
    "created_at",
  ];
  const expectedStatementConstraints = ["chk_subject_protocol_self_sourced", "chk_object_protocol_self_sourced"];

  const client = createPgClient(target.databaseUrl);
  try {
    await client`SELECT 1`;
    const schemaRows = await client<{ exists: boolean }[]>`
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.schemata
        WHERE schema_name = ${target.schema}
      ) AS exists
    `;
    const schemaExists = Boolean(schemaRows[0]?.exists);
    const tableRows = schemaExists
      ? await client<{ table_name: string }[]>`
          SELECT table_name
          FROM information_schema.tables
          WHERE table_schema = ${target.schema}
            AND (
              table_name = 'reference_identifiers'
              OR table_name = 'statements'
            )
          ORDER BY table_name
        `
      : [];
    const presentTables = new Set(tableRows.map((row: { table_name: string }) => row.table_name));
    const referenceIdentifierColumns = presentTables.has("reference_identifiers")
      ? (await client<{ column_name: string }[]>`
          SELECT column_name
          FROM information_schema.columns
          WHERE table_schema = ${target.schema}
            AND table_name = 'reference_identifiers'
          ORDER BY ordinal_position
        `).map((row: { column_name: string }) => row.column_name)
      : [];
    const statementsColumns = presentTables.has("statements")
      ? (await client<{ column_name: string }[]>`
          SELECT column_name
          FROM information_schema.columns
          WHERE table_schema = ${target.schema}
            AND table_name = 'statements'
          ORDER BY ordinal_position
        `).map((row: { column_name: string }) => row.column_name)
      : [];
    const statementConstraintRows = presentTables.has("statements")
      ? await client<{ conname: string }[]>`
          SELECT c.conname
          FROM pg_constraint c
          INNER JOIN pg_class t ON c.conrelid = t.oid
          INNER JOIN pg_namespace n ON t.relnamespace = n.oid
          WHERE n.nspname = ${target.schema}
            AND t.relname = 'statements'
            AND (
              c.conname = 'chk_subject_protocol_self_sourced'
              OR c.conname = 'chk_object_protocol_self_sourced'
            )
          ORDER BY c.conname
        `
      : [];
    const presentStatementConstraints = new Set(statementConstraintRows.map((row: { conname: string }) => row.conname));
    const missing: string[] = [];
    if (!schemaExists) missing.push(`schema.${target.schema}`);
    if (!presentTables.has("reference_identifiers")) missing.push(`${target.schema}.reference_identifiers`);
    if (!presentTables.has("statements")) missing.push(`${target.schema}.statements`);
    missing.push(...expectedReferenceIdentifierColumns.filter((column) => !referenceIdentifierColumns.includes(column)).map((column) => `${target.schema}.reference_identifiers.${column}`));
    missing.push(...expectedStatementsColumns.filter((column) => !statementsColumns.includes(column)).map((column) => `${target.schema}.statements.${column}`));
    missing.push(...expectedStatementConstraints.filter((name) => !presentStatementConstraints.has(name)).map((name) => `${target.schema}.statements.${name}`));
    return {
      ok: true,
      graphStoreType: "postgres" as const,
      key: target.key,
      configured: true,
      configuredFromSettings: target.configuredFromSettings,
      databaseUrlConfigured: true,
      databaseUrlSource: target.databaseUrlSource,
      databaseUrlEnv: target.databaseUrlEnv,
      schema: target.schema,
      reachable: true,
      missing,
    };
  } catch (error) {
    return {
      ok: true,
      graphStoreType: "postgres" as const,
      key: target.key,
      configured: true,
      configuredFromSettings: target.configuredFromSettings,
      databaseUrlConfigured: true,
      databaseUrlSource: target.databaseUrlSource,
      databaseUrlEnv: target.databaseUrlEnv,
      schema: target.schema,
      reachable: false,
      missing: ["postgres.connection"],
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    await client.end({ timeout: 1 });
  }
}

async function getRuntimeStatusOverview() {
  const configuredKeys = listConfiguredStoreTargetKeys();
  const graphs = await Promise.all(configuredKeys.map(async (key) => {
    const resolved = resolveStoreTarget(new Map<string, string | boolean>([["graph", key]]));
    const detailed = await getGraphStatus(resolved);
    return {
      key,
      graphStoreType: detailed.graphStoreType,
      warnings: "warnings" in detailed ? detailed.warnings : undefined,
      next: {
        statusCommand: `fide graph status --graph-key ${key}`,
        ...(("graphStoreType" in detailed && detailed.graphStoreType === "fide-jsonl")
          ? {
              writeHelpCommand: "fide statements write -h",
              writeCommand: "fide statements write ...",
            }
          : {
              queryHelpCommand: "fide query run -h",
              queryCommand: `fide query run --graph-key ${key} ... --to-fide-path results/rows.json`,
            }),
      },
    };
  }));

  return {
    graphs,
  };
}

export async function runGraphStatus(args: string[] = []): Promise<number> {
  const { flags, positionals } = parseArgs(args, { booleanKeys: GRAPH_STATUS_PARSE_KEYS });
  const useJson = shouldUseJsonOutput(flags);
  if (hasFlag(flags, "help") || hasFlag(flags, "-h")) {
    console.log(renderCommandHelp(graphStatusCommand));
    return 0;
  }

  if (positionals.length > 0) {
    throw new Error("`graph status` does not accept positional arguments.");
  }

  const graphKey = typeof flags.get("graph-key") === "string" ? assertGraphKey(String(flags.get("graph-key"))) : null;
  if (flags.has("fide-dir")) {
    throw new Error("`--fide-dir` is no longer supported. Run this command from the target project root or set `FIDE_DIR` in the environment.");
  }

  if (graphKey) {
    const targetFlags = new Map<string, string | boolean>([["graph", graphKey]]);
    const payload = {
      ok: true,
      scope: "graph-status.v1",
      local: null,
      graphs: [await getGraphStatus(resolveStoreTarget(targetFlags))],
    };
    if (useJson) {
      printJson(payload);
    } else {
      console.log(formatPretty("graph-status.v1", payload) ?? JSON.stringify(payload, null, 2));
    }
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
      writeHelpCommand: "fide statements write -h",
      writeCommand: "fide statements write ...",
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

  const payload = {
    ok: true,
    scope: "graph-status.v1",
    local,
    ...(await getRuntimeStatusOverview()),
  };
  if (useJson) {
    printJson(payload);
  } else {
    console.log(formatPretty("graph-status.v1", payload) ?? JSON.stringify(payload, null, 2));
  }
  return 0;
}
