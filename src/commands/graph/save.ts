import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { FideSettings } from "@chris-test/graph";
import { validateGraphSettings } from "@chris-test/graph";
import type { WorkspaceGraphType } from "@chris-test/workspace";
import { getStringFlag, hasFlag, parseArgs, shouldUseJsonOutput } from "../../util/command/args.js";
import {
  booleanKeysFromCommand,
  defineCommand,
  mergeBooleanKeySets,
  renderCommandHelp,
} from "../../util/command/command-metadata.js";
import { printJson, readUtf8 } from "../../util/command/io.js";
import { assertGraphKey } from "../../util/ids/selectors.js";
import { formatPretty } from "../../util/command/pretty.js";
import { okResponse } from "../../util/command/response.js";
import { readJsonFile, resolveFideContext, resolveSettingsPath } from "../../util/project/fide-dir.js";

export const graphSaveCommand = defineCommand({
  surface: "graph.save",
  command: "fide graph save",
  outputType: "GraphSaveOutput",
  summary: "Create or update a graph in this project",
  usage: [
    "fide graph save --graph <key> --type postgres --connection '<json>'",
    "fide graph save --graph <key> --type sqlite --connection '<json>'",
    "fide graph save --graph <key> --recipe-file <recipe.json>",
  ],
  paramOrder: [
    "graph",
    "type",
    "connection",
    "recipe-file",
    "dry-run",
    "pretty",
  ],
  params: {
    graph: { kind: "string", required: true, description: "Graph key", valueLabel: "<key>" },
    type: { kind: "string", enum: ["postgres", "sqlite", "fide-jsonl"], description: "Local graph type" },
    connection: { kind: "string", description: "Connection JSON for this graph type", valueLabel: "'<json>'" },
    "recipe-file": { kind: "string", description: "JSON file containing graph recipe steps", valueLabel: "<recipe.json>" },
    "dry-run": { kind: "boolean", description: "Show the local create or update without writing settings.json" },
    pretty: { kind: "boolean", shorthand: "-p", description: "Human-readable output" },
  },
  examples: [
    "fide graph save --graph primary --type postgres --connection '{\"url\":\"FIDE_GRAPH_DATABASE_URL\",\"schema\":\"fide_graph\"}'",
    "fide graph save --graph local --type sqlite --connection '\".fide/graph.sqlite\"'",
  ],
  notes: [
    "Writes a graph definition into this project's `.fide/settings.json`.",
    "If the graph key already exists, this command updates it in place.",
    "Use `fide start` to sync local graph metadata from project settings into the bound workspace.",
  ],
});

const GRAPH_SAVE_PARSE_KEYS = mergeBooleanKeySets(booleanKeysFromCommand(graphSaveCommand));

export type GraphSaveOutput = {
  ok: true;
  scope: "graph-save-local.v1";
  command: "fide graph save";
  next?: Record<string, unknown>;
  [key: string]: unknown;
};

type GraphSaveResultState = "created" | "updated" | "unchanged";
type LocalSettingsGraphRecord = NonNullable<FideSettings["graphs"]>[string];

function canonicalizeValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => canonicalizeValue(entry));
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, canonicalizeValue(entry)] as const);
    return Object.fromEntries(entries);
  }
  return value;
}

function localGraphsEqual(left: LocalSettingsGraphRecord | null, right: LocalSettingsGraphRecord): boolean {
  return JSON.stringify(canonicalizeValue(left)) === JSON.stringify(canonicalizeValue(right));
}

function readGraphs(settings: Record<string, unknown>): Record<string, LocalSettingsGraphRecord> {
  const raw = settings.graphs;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return raw as Record<string, LocalSettingsGraphRecord>;
}

function readSettings(settingsPath: string): FideSettings {
  return readJsonFile<FideSettings>(settingsPath) ?? {};
}

function readLocalProjectGraph(graphKey: string, settingsPath: string): LocalSettingsGraphRecord | null {
  return readGraphs(readSettings(settingsPath) as Record<string, unknown>)[graphKey] ?? null;
}

function assertWorkspaceGraphType(value: string | null | undefined): WorkspaceGraphType | null {
  if (value === "postgres" || value === "sqlite" || value === "fide-jsonl") {
    return value;
  }
  return null;
}

function parseConnectionFlag(raw: string | null): unknown {
  if (raw === null) return null;
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error("Invalid --connection value. Expected valid JSON.");
  }
}

function resolvePostgresConnection(
  connectionInput: unknown,
  existingConnection: unknown,
): { url?: string; schema: string } {
  const nextConnection = connectionInput ?? existingConnection;
  if (!nextConnection || typeof nextConnection !== "object" || Array.isArray(nextConnection)) {
    throw new Error(
      "Postgres graphs require --connection '{\"url\":\"...\",\"schema\":\"...\"}' when creating or updating without an existing connection object.",
    );
  }
  const connection = nextConnection as Record<string, unknown>;
  if (typeof connection.schema !== "string" || connection.schema.trim().length === 0) {
    throw new Error(
      "Postgres graph connection JSON must include a non-empty `schema` string.",
    );
  }
  if (connection.url !== undefined && typeof connection.url !== "string") {
    throw new Error("Postgres graph connection `url` must be a string when provided.");
  }
  return {
    ...(typeof connection.url === "string" ? { url: connection.url } : {}),
    schema: connection.schema,
  };
}

function resolveStringConnection(
  type: "sqlite" | "fide-jsonl",
  connectionInput: unknown,
  existingConnection: unknown,
): string {
  const nextConnection = connectionInput ?? existingConnection ?? null;
  if (typeof nextConnection !== "string" || nextConnection.trim().length === 0) {
    throw new Error(
      `${type} graphs require --connection '\"...\"' when creating or updating without an existing connection string.`,
    );
  }
  return nextConnection;
}

async function readGraphInput(args: string[]): Promise<{
  flags: Map<string, string | boolean>;
  graphKey: string;
  graph: LocalSettingsGraphRecord;
}> {
  const { flags } = parseArgs(args, { booleanKeys: GRAPH_SAVE_PARSE_KEYS });
  if (hasFlag(flags, "help") || hasFlag(flags, "-h")) {
    console.log(renderCommandHelp(graphSaveCommand));
    return {
      flags,
      graphKey: "__help__",
      graph: { type: "postgres", connection: { schema: "fide_graph" } },
    };
  }

  const settingsPath = resolveSettingsPath(process.cwd());
  const graphKeyRaw = getStringFlag(flags, "graph");
  const graphKey = graphKeyRaw ? assertGraphKey(graphKeyRaw) : null;
  if (!graphKey) throw new Error("Missing required flag: --graph <key>.");

  const existing = readLocalProjectGraph(graphKey, settingsPath);
  const type = assertWorkspaceGraphType(getStringFlag(flags, "type"))
    ?? assertWorkspaceGraphType(existing?.type as string | undefined);
  if (!type) {
    throw new Error(
      existing
        ? `Graph "${graphKey}" is missing a valid type in settings.json.`
        : "Missing required flag: --type <postgres|sqlite|fide-jsonl>.",
    );
  }

  const recipeFile = getStringFlag(flags, "recipe-file");
  const recipe = recipeFile ? JSON.parse(await readUtf8(recipeFile)) : existing?.recipe;
  const connectionInput = parseConnectionFlag(getStringFlag(flags, "connection"));

  if (type === "postgres") {
    const nextConnection = resolvePostgresConnection(connectionInput, existing?.connection);
    return {
      flags,
      graphKey,
      graph: {
        ...(existing ?? {}),
        type,
        connection: nextConnection,
        ...(recipe !== undefined ? { recipe } : {}),
      },
    };
  }

  const connection = resolveStringConnection(type, connectionInput, existing?.connection);

  return {
    flags,
    graphKey,
    graph: {
      ...(existing ?? {}),
      type,
      connection,
      ...(recipe !== undefined ? { recipe } : {}),
    },
  };
}

async function writeSettings(settingsPath: string, settings: FideSettings): Promise<void> {
  await mkdir(dirname(settingsPath), { recursive: true });
  await writeFile(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
}

function getResultState(previous: LocalSettingsGraphRecord | null, next: LocalSettingsGraphRecord): GraphSaveResultState {
  if (!previous) return "created";
  return localGraphsEqual(previous, next) ? "unchanged" : "updated";
}

export async function runGraphSaveCommand(args: string[]): Promise<number> {
  const { flags, graphKey, graph } = await readGraphInput(args);
  if (hasFlag(flags, "help") || hasFlag(flags, "-h")) {
    return 0;
  }

  const useJson = shouldUseJsonOutput(flags);
  const dryRun = hasFlag(flags, "dry-run");
  const fide = resolveFideContext(process.cwd());
  const settingsPath = resolveSettingsPath(process.cwd());
  const settings = readSettings(settingsPath);
  const previous = readLocalProjectGraph(graphKey, settingsPath);
  const nextSettings: FideSettings = {
    ...settings,
    graphs: {
      ...(settings.graphs ?? {}),
      [graphKey]: graph,
    },
  };

  validateGraphSettings(nextSettings);
  const result = getResultState(previous, graph);

  if (!dryRun) {
    await writeSettings(settingsPath, nextSettings);
  }

  const payload = okResponse("graph-save-local.v1", {
    dryRun,
    targetScope: "local",
    root: fide.root,
    fideDir: fide.fideDir,
    settingsPath,
    graphKey,
    result,
    graph,
  }, {
    command: "fide graph save",
    next: dryRun
      ? { apply: `fide graph save --graph ${graphKey}` }
      : { sync: "fide start" },
  });

  if (useJson) {
    printJson(payload);
  } else {
    console.log(formatPretty("graph-save-local.v1", payload) ?? JSON.stringify(payload, null, 2));
  }
  return 0;
}
