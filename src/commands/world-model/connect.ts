// fide world-model connect --world-model-key demo --connection '{"type":"sqlite","fide-path":"world-models/demo/world.sqlite"}' --initialize --initialize-options '{"dangerously_overwrite":true}'

import { resolve } from "node:path";
import { rm } from "node:fs/promises";
import { getStringFlag, hasFlag, parseArgs, shouldUseJsonOutput } from "../../util/command/args.js";
import {
  booleanKeysFromCommand,
  defineCommand,
  mergeBooleanKeySets,
  renderCommandHelp,
} from "../../util/command/command-metadata.js";
import { printJson } from "../../util/command/io.js";
import { assertWorldModelKey } from "../../util/ids/selectors.js";
import { formatPretty } from "../../util/command/pretty.js";
import { okResponse } from "../../util/command/response.js";
import { initializeSqliteGraphStorage } from "@chris-test/graph";
import {
  readLocalProjectWorldModel,
  writeLocalProjectWorldModel,
  type LocalWorldModelRecord,
} from "../../lib/project/config/world-model-config.js";
import { resolveFideContext, resolveWorldModelConfigPath } from "../../lib/project/config/fide-dir.js";
import { validateWorldModelStoreConfig } from "../../lib/project/config/project-settings.js";

export const worldModelConnectCommand = defineCommand({
  surface: "world-model.connect",
  command: "fide world-model connect",
  outputType: "WorldModelConnectOutput",
  summary: "Create or update a world model sqlite connection in this project",
  usage: [
    "fide world-model connect --world-model-key <world-model-key> --connection <connection-json>",
  ],
  paramOrder: [
    "world-model-key",
    "connection",
    "initialize",
    "initialize-options",
    "dry-run",
    "pretty",
  ],
  params: {
    "world-model-key": {
      kind: "string",
      required: true,
      valueLabel: "<world-model-key>",
      description: "World model key for this connection definition",
    },
    connection: {
      kind: "string",
      valueLabel: "<connection-json>",
      description: "Connection JSON for this world model (sqlite only)",
    },
    initialize: { kind: "boolean", description: "Initialize sqlite storage after writing config" },
    "initialize-options": {
      kind: "string",
      valueLabel: "<initialize-options>",
      description: "Initialization options JSON",
    },
    "dry-run": { kind: "boolean", description: "Show the local create or update without writing config.json" },
    pretty: { kind: "boolean", shorthand: "-p", description: "Human-readable output" },
  },
  examples: [
    "fide world-model connect --world-model-key demo --connection '{\"type\":\"sqlite\",\"fide-path\":\"world-models/demo/world.sqlite\"}'",
    "fide world-model connect --world-model-key demo --connection '{\"type\":\"sqlite\",\"project-path\":\"tmp/world-models/demo.sqlite\"}'",
    "fide world-model connect --world-model-key demo --connection '{\"type\":\"sqlite\",\"fide-path\":\"world-models/demo/world.sqlite\"}' --initialize",
    'fide world-model connect --world-model-key demo --connection \'{"type":"sqlite","fide-path":"world-models/demo/world.sqlite"}\' --initialize --initialize-options \'{"dangerously_overwrite":true}\'',
  ],
  values: [
    {
      label: "<connection-json>",
      value: '{"type":"sqlite", <sqlite-path>}',
    },
    {
      label: "<initialize-options>",
      value: '{"dangerously_overwrite"?: boolean}',
    },
    {
      label: '<connection-json-type> = "sqlite"',
      children: [
        {
          label: "<sqlite-path>",
          requires: "one of: `fide-path` or `project-path`, ending in `.sqlite`",
          children: [
            {
              label: "fide-path",
              value: "string",
              suggested: '"world-models/<world-model-key>/world.sqlite"',
            },
            {
              label: "project-path",
              value: "string",
              suggested: '"tmp/world-models/<world-model-key>.sqlite"',
            },
          ],
        },
      ],
    },
  ],

  notes: [
    "Writes a definition into `.fide/world-models/<worldModelKey>/config.json` in this project.",
    "`fide-path` resolves relative to the active `.fide` directory.",
    "`project-path` resolves relative to the project root and is stable regardless of where the command is launched.",
    "`--initialize-options` is only used when `--initialize` is present.",
    "If the world model key already exists, this command updates it in place.",
    "Only sqlite connections are supported (same storage shape as graphs).",
    "Population from source graphs (`load` / `build`) is not part of `connect`; use follow-up tooling when ready.",
  ],
});

const WORLD_MODEL_CONNECT_PARSE_KEYS = mergeBooleanKeySets(booleanKeysFromCommand(worldModelConnectCommand));
const WORLD_MODEL_CONNECT_SCOPE = "world-model-connect-local.v1";

export type WorldModelConnectOutput = {
  ok: true;
  scope: typeof WORLD_MODEL_CONNECT_SCOPE;
  command: "fide world-model connect";
  next?: Record<string, unknown>;
  [key: string]: unknown;
};

type WorldModelConnectResultState = "created" | "updated" | "unchanged";

type SnapshotInitializeOptions = {
  dangerously_overwrite?: boolean;
};

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

function localRecordsEqual(left: LocalWorldModelRecord | null, right: LocalWorldModelRecord): boolean {
  return JSON.stringify(canonicalizeValue(left)) === JSON.stringify(canonicalizeValue(right));
}

function assertConnectType(value: string | null | undefined): "sqlite" | null {
  if (value === "sqlite") {
    return value;
  }
  return null;
}

function readExistingType(existing: LocalWorldModelRecord | null): "sqlite" | null {
  if (!existing || !existing.connection || typeof existing.connection !== "object" || Array.isArray(existing.connection)) {
    return null;
  }
  const connectionType = (existing.connection as { type?: unknown }).type;
  return assertConnectType(typeof connectionType === "string" ? connectionType : null);
}

function parseJsonFlag(raw: string | null, flagName: string): unknown {
  if (raw === null) return null;
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`Invalid --${flagName} value. Expected valid JSON.`);
  }
}

function resolveInitializeOptions(raw: string | null): SnapshotInitializeOptions {
  if (raw === null) return {};
  const parsed = parseJsonFlag(raw, "initialize-options");
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Invalid --initialize-options value. Expected a JSON object.");
  }
  const options = parsed as Record<string, unknown>;
  if (
    options.dangerously_overwrite !== undefined
    && typeof options.dangerously_overwrite !== "boolean"
  ) {
    throw new Error("`dangerously_overwrite` in --initialize-options must be a boolean when provided.");
  }
  return {
    ...(typeof options.dangerously_overwrite === "boolean" ? { dangerously_overwrite: options.dangerously_overwrite } : {}),
  };
}


function resolveSqliteConnection(
  connectionInput: unknown,
  existingConnection: unknown,
): { type: "sqlite"; "fide-path"?: string; "project-path"?: string } {
  const nextConnection = connectionInput ?? existingConnection ?? null;
  if (!nextConnection || typeof nextConnection !== "object" || Array.isArray(nextConnection)) {
    throw new Error(
      "Sqlite world models require --connection '{\"fide-path\":\"...\"}' or '{\"project-path\":\"...\"}' when creating or updating without an existing connection object.",
    );
  }
  const connection = nextConnection as Record<string, unknown>;
  if (connection.type !== undefined && connection.type !== "sqlite") {
    throw new Error(
      'Sqlite world model connection JSON must include `type: "sqlite"` when `type` is provided.',
    );
  }
  const fidePath = typeof connection["fide-path"] === "string" ? connection["fide-path"] : null;
  const projectPath = typeof connection["project-path"] === "string" ? connection["project-path"] : null;
  if ((!fidePath || fidePath.trim().length === 0) && (!projectPath || projectPath.trim().length === 0)) {
    throw new Error("Sqlite world model connection JSON must include a non-empty `fide-path` or `project-path` string.");
  }
  return {
    type: "sqlite",
    ...(fidePath && fidePath.trim().length > 0 ? { "fide-path": fidePath } : {}),
    ...(projectPath && projectPath.trim().length > 0 ? { "project-path": projectPath } : {}),
  };
}

async function readWorldModelInput(args: string[]): Promise<{
  flags: Map<string, string | boolean>;
  worldModelKey: string;
  worldModel: LocalWorldModelRecord;
}> {
  const { flags } = parseArgs(args, { booleanKeys: WORLD_MODEL_CONNECT_PARSE_KEYS });
  if (hasFlag(flags, "help") || hasFlag(flags, "-h")) {
    console.log(renderCommandHelp(worldModelConnectCommand));
    return {
      flags,
      worldModelKey: "__help__",
      worldModel: { connection: { type: "sqlite", "fide-path": "world-models/demo/world.sqlite" } },
    };
  }

  const worldModelKeyRaw = getStringFlag(flags, "world-model-key");
  const worldModelKey = worldModelKeyRaw ? assertWorldModelKey(worldModelKeyRaw) : null;
  if (!worldModelKey) throw new Error("Missing required flag: --world-model-key <key>.");

  const existing = readLocalProjectWorldModel(worldModelKey);
  const connectionInput = parseJsonFlag(getStringFlag(flags, "connection"), "connection");
  const requestedType = connectionInput && typeof connectionInput === "object" && !Array.isArray(connectionInput)
    ? assertConnectType(
      typeof (connectionInput as { type?: unknown }).type === "string"
        ? (connectionInput as { type: string }).type
        : null,
    )
    : null;
  const type = requestedType ?? readExistingType(existing);
  if (!type) {
    throw new Error(
      existing
        ? `World model "${worldModelKey}" is missing a valid connection.type in config.json.`
        : "Missing required connection type. Include `type` in --connection JSON.",
    );
  }

  if (type !== "sqlite") {
    throw new Error("Only sqlite world models are supported for `world-model connect`.");
  }

  const connection = resolveSqliteConnection(connectionInput, existing?.connection);

  return {
    flags,
    worldModelKey,
    worldModel: {
      ...Object.fromEntries(Object.entries(existing ?? {}).filter(([key]) => key !== "type")),
      connection,
    },
  };
}

function getResultState(previous: LocalWorldModelRecord | null, next: LocalWorldModelRecord): WorldModelConnectResultState {
  if (!previous) return "created";
  return localRecordsEqual(previous, next) ? "unchanged" : "updated";
}

export async function runWorldModelConnectCommand(args: string[]): Promise<number> {
  const { flags, worldModelKey, worldModel } = await readWorldModelInput(args);
  if (hasFlag(flags, "help") || hasFlag(flags, "-h")) {
    return 0;
  }

  const useJson = shouldUseJsonOutput(flags);
  const dryRun = hasFlag(flags, "dry-run");
  const initialize = hasFlag(flags, "initialize");
  const initializeOptions = resolveInitializeOptions(getStringFlag(flags, "initialize-options"));
  const fide = resolveFideContext(process.cwd());
  const configPath = resolveWorldModelConfigPath(worldModelKey, process.cwd());
  const previous = readLocalProjectWorldModel(worldModelKey);

  validateWorldModelStoreConfig(worldModelKey, worldModel);
  const result = getResultState(previous, worldModel);

  if (!dryRun) {
    await writeLocalProjectWorldModel(worldModelKey, worldModel);
  }

  let initialized: { type: "sqlite"; file: string } | null = null;
  if (initialize && !dryRun) {
    const connection = worldModel.connection;
    const resolveFileBackedPath = (conn: { "fide-path"?: string; "project-path"?: string }): string | null => {
      if (typeof conn["fide-path"] === "string") {
        return conn["fide-path"].startsWith("/")
          ? conn["fide-path"]
          : resolve(fide.fideDir, conn["fide-path"]);
      }
      if (typeof conn["project-path"] === "string") {
        return conn["project-path"].startsWith("/")
          ? conn["project-path"]
          : resolve(fide.root, conn["project-path"]);
      }
      return null;
    };
    if (connection && typeof connection === "object" && !Array.isArray(connection) && connection.type === "sqlite") {
      const sqliteFile = resolveFileBackedPath(
        connection as { "fide-path"?: string; "project-path"?: string },
      );
      if (!sqliteFile) {
        throw new Error("Sqlite world model connection is missing both `fide-path` and `project-path`.");
      }
      if (initializeOptions.dangerously_overwrite) {
        await rm(sqliteFile, { force: true });
      }
      await initializeSqliteGraphStorage({
        file: sqliteFile,
      });
      initialized = { type: "sqlite", file: sqliteFile };
    } else {
      throw new Error("`fide world-model connect --initialize` supports sqlite only.");
    }
  }

  const payload = okResponse(WORLD_MODEL_CONNECT_SCOPE, {
    dryRun,
    initialize,
    initializeOptions,
    targetScope: "local",
    root: fide.root,
    fideDir: fide.fideDir,
    configPath,
    worldModelKey,
    result,
    worldModel,
    ...(initialized ? { initialized } : {}),
  }, {
    command: "fide world-model connect",
    next: dryRun
      ? { apply: `fide world-model connect --world-model-key ${worldModelKey}` }
      : {
          ...(initialized ? {} : { initialize: `fide world-model connect --world-model-key ${worldModelKey} --initialize` }),
          sync: "fide start",
        },
  });

  if (useJson) {
    printJson(payload);
  } else {
    console.log(formatPretty(WORLD_MODEL_CONNECT_SCOPE, payload) ?? JSON.stringify(payload, null, 2));
  }
  return 0;
}
