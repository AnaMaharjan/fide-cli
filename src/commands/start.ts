import { spawn } from "node:child_process";
import { mkdirSync, openSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import chokidar, { type FSWatcher } from "chokidar";
import { getStringFlag, parseArgs, shouldUseJsonOutput } from "../util/args.js";
import { renderCommandHelp } from "../util/command-metadata.js";
import { resolveAuthSettings } from "../util/auth-settings.js";
import { createAuthApiClient } from "../util/auth-api.js";
import { printJson } from "../util/io.js";
import { formatPretty } from "../util/pretty.js";
import { resolveWorkspaceSelectionOrThrow } from "../util/workspace-settings.js";
import { okResponse } from "../util/response.js";
import {
  clearSyncSession,
  isProcessAlive,
  readSyncSession,
  resolveSyncDir,
  updateSyncSession,
  writeSyncSession,
} from "../util/sync-session.js";
import { readJsonFile, resolveFideContext } from "../util/fide-dir.js";
import { startCommand } from "./metadata.js";

type SyncServerMessage = {
  type?: string;
  [key: string]: unknown;
};

type ProjectSettingsRecord = {
  graphs?: Record<string, {
    type?: "postgres" | "sqlite" | "fide-jsonl";
    recipe?: unknown;
    metadata?: unknown;
  }>;
};

type HostedWorkspaceGraphInput = {
  type: "postgres" | "sqlite" | "fide-jsonl";
  recipe?: unknown;
  metadata?: unknown;
};

function logSyncRunner(event: string, details?: Record<string, unknown>): void {
  const payload = details ? ` ${JSON.stringify(details)}` : "";
  console.log(`[${new Date().toISOString()}] ${event}${payload}`);
}

function resolveExplicitSyncWebSocketUrl(value: string): string {
  const trimmed = value.trim();
  const parsed = new URL(trimmed);
  if (parsed.protocol === "ws:" || parsed.protocol === "wss:") {
    return parsed.toString();
  }
  if (parsed.protocol === "http:" || parsed.protocol === "https:") {
    parsed.protocol = parsed.protocol === "https:" ? "wss:" : "ws:";
    parsed.pathname = "/ws";
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
  }
  throw new Error(`Unsupported sync URL protocol for ${value}. Use ws://, wss://, http://, or https://.`);
}

function deriveSyncWebSocketUrl(baseUrl: string): string {
  const parsed = new URL(baseUrl);
  const protocol = parsed.protocol === "https:" ? "wss:" : "ws:";
  const next = new URL(parsed.toString());
  next.protocol = protocol;
  next.username = "";
  next.password = "";
  next.pathname = "/ws";
  next.search = "";
  next.hash = "";

  if (parsed.hostname === "api.fide.work") {
    next.hostname = "sync.fide.work";
    next.port = "";
    return next.toString();
  }

  if (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") {
    next.port = "8787";
    return next.toString();
  }

  if (parsed.hostname.startsWith("api.")) {
    next.hostname = `sync.${parsed.hostname.slice(4)}`;
    next.port = "";
    return next.toString();
  }

  throw new Error(`Unable to derive sync websocket URL from API base URL ${baseUrl}. Pass --sync-url <wss://.../ws>.`);
}

function parseSyncMessage(raw: unknown): SyncServerMessage {
  if (typeof raw !== "string") {
    return { type: "unknown", rawType: typeof raw };
  }
  try {
    return JSON.parse(raw) as SyncServerMessage;
  } catch {
    return { type: "raw", raw };
  }
}

function readHostedGraphsFromProjectSettings(settingsPath: string): Map<string, HostedWorkspaceGraphInput> {
  const settings = readJsonFile<ProjectSettingsRecord>(settingsPath);
  const graphs = settings?.graphs;
  const result = new Map<string, HostedWorkspaceGraphInput>();
  if (!graphs || typeof graphs !== "object") {
    return result;
  }

  for (const [graphKey, graph] of Object.entries(graphs)) {
    if (!graph || typeof graph !== "object") {
      continue;
    }
    const type = graph.type;
    if (type !== "postgres" && type !== "sqlite" && type !== "fide-jsonl") {
      continue;
    }
    result.set(graphKey, {
      type,
      ...(graph.recipe !== undefined ? { recipe: graph.recipe } : {}),
      ...(graph.metadata !== undefined ? { metadata: graph.metadata } : {}),
    });
  }

  return result;
}

function renderStartHelp(): string {
  const activeEnv: string[] = [];
  if (process.env.FIDE_SYNC_BASE_URL?.trim()) {
    activeEnv.push(`  FIDE_SYNC_BASE_URL=${process.env.FIDE_SYNC_BASE_URL.trim()}`);
  }
  if (process.env.FIDE_API_BASE_URL?.trim()) {
    activeEnv.push(`  FIDE_API_BASE_URL=${process.env.FIDE_API_BASE_URL.trim()}`);
  }
  if (process.env.FIDE_WORKSPACE_ID?.trim()) {
    activeEnv.push(`  FIDE_WORKSPACE_ID=${process.env.FIDE_WORKSPACE_ID.trim()}`);
  }
  if (process.env.FIDE_WORKSPACE_URL?.trim()) {
    activeEnv.push(`  FIDE_WORKSPACE_URL=${process.env.FIDE_WORKSPACE_URL.trim()}`);
  }

  if (activeEnv.length === 0) {
    return renderCommandHelp(startCommand);
  }

  return `${renderCommandHelp(startCommand)}\n\nActive Env:\n${activeEnv.join("\n")}`;
}

function resolveCliEntryPath(): string {
  const currentFile = fileURLToPath(import.meta.url);
  return resolve(dirname(currentFile), "..", "bin", "fide.js");
}

function resolveSyncUrl(flags: Map<string, string | boolean>, apiBaseUrl: string): string {
  const flagSyncUrl = getStringFlag(flags, "sync-url")?.trim();
  const envSyncBaseUrl = process.env.FIDE_SYNC_BASE_URL?.trim();
  if (flagSyncUrl) {
    return resolveExplicitSyncWebSocketUrl(flagSyncUrl);
  }
  if (envSyncBaseUrl) {
    return resolveExplicitSyncWebSocketUrl(envSyncBaseUrl);
  }
  return deriveSyncWebSocketUrl(apiBaseUrl);
}

function resolveSyncRuntimeParts(syncUrl: string): { syncBaseUrl: string; syncEndpoint: string } {
  const parsed = new URL(syncUrl);
  const syncEndpoint = parsed.pathname || "/ws";
  parsed.pathname = "";
  parsed.search = "";
  parsed.hash = "";
  return {
    syncBaseUrl: parsed.toString().replace(/\/$/, ""),
    syncEndpoint,
  };
}

function printStartResult(useJson: boolean, payload: Record<string, unknown>): void {
  const response = okResponse("start.v1", payload, { command: "fide start" });
  if (useJson) {
    printJson(response);
    return;
  }
  console.log(formatPretty("start.v1", response));
}

async function runDetachedStart(flags: Map<string, string | boolean>, useJson: boolean): Promise<number> {
  const auth = await resolveAuthSettings(flags);
  if (!auth) {
    throw new Error("Missing auth. Run `fide login` first or set FIDE_API_BASE_URL and FIDE_ACCESS_TOKEN.");
  }

  const workspace = await resolveWorkspaceSelectionOrThrow(flags);
  const syncUrl = resolveSyncUrl(flags, auth.baseUrl);
  const { syncBaseUrl, syncEndpoint } = resolveSyncRuntimeParts(syncUrl);

  const existing = await readSyncSession();
  if (existing && isProcessAlive(existing.pid)) {
    printStartResult(useJson, {
      started: false,
      alreadyRunning: true,
      pid: existing.pid,
      status: existing.status,
      syncBaseUrl: existing.syncBaseUrl,
      syncEndpoint: existing.syncEndpoint ?? null,
      workspaceId: workspace.workspaceId,
    });
    return 0;
  }

  if (existing) {
    await clearSyncSession();
  }

  const cliEntryPath = resolveCliEntryPath();
  const syncDir = resolveSyncDir();
  mkdirSync(syncDir, { recursive: true });
  const logFd = openSync(resolve(syncDir, "sync.log"), "w");
  const fide = resolveFideContext(process.cwd());

  const child = spawn(
    process.execPath,
    [
      cliEntryPath,
      "__sync-runner",
      "--sync-url",
      syncUrl,
      "--workspace",
      workspace.workspaceId,
    ],
    {
      cwd: process.cwd(),
      detached: true,
      stdio: ["ignore", logFd, logFd],
      env: {
        ...process.env,
        ...(auth.accountId ? { FIDE_ACCOUNT_ID: auth.accountId } : {}),
        FIDE_WORKSPACE_ID: workspace.workspaceId,
      },
    },
  );

  child.unref();

  await writeSyncSession({
    pid: child.pid!,
    startedAt: new Date().toISOString(),
    syncBaseUrl,
    syncEndpoint,
    projectFideRoots: [fide.fideDir],
    status: "starting",
    error: null,
  });

  printStartResult(useJson, {
    started: true,
    pid: child.pid,
    syncUrl,
    workspaceId: workspace.workspaceId,
  });
  return 0;
}

export async function runSyncRunnerCommand(args: string[]): Promise<number> {
  const { flags } = parseArgs(args);
  const auth = await resolveAuthSettings(flags);
  if (!auth) {
    throw new Error("Missing auth for sync runner.");
  }

  const workspace = await resolveWorkspaceSelectionOrThrow(flags);
  const syncUrl = resolveSyncUrl(flags, auth.baseUrl);
  const { syncEndpoint } = resolveSyncRuntimeParts(syncUrl);
  const websocket = new WebSocket(syncUrl);
  const pid = process.pid;
  const workspaceApi = createAuthApiClient({
    baseUrl: auth.baseUrl,
    accessToken: auth.accessToken,
  });
  const fide = resolveFideContext(process.cwd());
  const projectSettingsPath = join(fide.fideDir, "settings.json");
  const projectQueriesPath = join(fide.fideDir, "queries");
  let watcher: FSWatcher | null = null;

  const syncProjectGraphs = async () => {
    const localGraphs = readHostedGraphsFromProjectSettings(projectSettingsPath);
    const remoteGraphs = await workspaceApi.listWorkspaceGraphs(workspace.workspaceId);
    logSyncRunner("graphs.sync.start", {
      projectSettingsPath,
      workspaceId: workspace.workspaceId,
      localGraphKeys: Array.from(localGraphs.keys()),
      remoteGraphKeys: remoteGraphs.map((graph) => graph.graphKey),
    });

    for (const [graphKey, localGraph] of localGraphs.entries()) {
      const remoteGraph = remoteGraphs.find((graph) => graph.graphKey === graphKey) ?? null;
      const normalizedRemoteGraph = remoteGraph
        ? {
          type: remoteGraph.type,
          ...(remoteGraph.recipe !== undefined ? { recipe: remoteGraph.recipe } : {}),
          ...(remoteGraph.metadata !== undefined ? { metadata: remoteGraph.metadata } : {}),
        }
        : null;

      if (normalizedRemoteGraph && isDeepStrictEqual(normalizedRemoteGraph, localGraph)) {
        logSyncRunner("graphs.sync.skip", {
          graphKey,
          reason: "unchanged",
        });
        continue;
      }

      logSyncRunner("graphs.sync.upsert", {
        graphKey,
        reason: remoteGraph ? "changed" : "missing_remote",
        graph: localGraph,
      });
      const saved = await workspaceApi.saveWorkspaceGraph({
        workspaceId: workspace.workspaceId,
        graphKey,
        graph: localGraph,
      });
      logSyncRunner("graphs.sync.upsert.ok", {
        graphKey: saved.graphKey,
        type: saved.type,
      });
    }

    for (const remoteGraph of remoteGraphs) {
      if (localGraphs.has(remoteGraph.graphKey)) {
        continue;
      }
      logSyncRunner("graphs.sync.skip", {
        graphKey: remoteGraph.graphKey,
        reason: "remote_only",
      });
    }
  };

  const syncProjectState = async (path: string) => {
    const errors: string[] = [];

    try {
      await syncProjectGraphs();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(message);
      logSyncRunner("graphs.sync.error", {
        path,
        error: message,
      });
    }

    if (errors.length > 0) {
      await updateSyncSession({
        pid,
        status: "error",
        error: errors.join(" | "),
      });
      return;
    }

    await updateSyncSession({
      pid,
      status: "attached",
      error: null,
    });
  };

  const startProjectWatcher = async () => {
    if (watcher) return;
    logSyncRunner("watcher.start", {
      projectSettingsPath,
      projectQueriesPath,
    });
    watcher = chokidar.watch([projectSettingsPath, projectQueriesPath], {
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 200,
        pollInterval: 50,
      },
    });

    watcher.on("change", async (path: string) => {
      logSyncRunner("watcher.change", { path });
      if (path === projectSettingsPath) {
        await syncProjectState(path);
        return;
      }
      if (path.startsWith(projectQueriesPath)) {
        logSyncRunner("queries.sync.skip", {
          path,
          reason: "not_implemented",
        });
      }
    });

    watcher.on("add", async (path: string) => {
      logSyncRunner("watcher.add", { path });
      if (path === projectSettingsPath) {
        await syncProjectState(path);
        return;
      }
      if (path.startsWith(projectQueriesPath)) {
        logSyncRunner("queries.sync.skip", {
          path,
          reason: "not_implemented",
        });
      }
    });

    await syncProjectState(projectSettingsPath);
  };

  const waitForEnd = new Promise<number>((resolve, reject) => {
    let settled = false;

    const finish = async (code: number, update?: Record<string, unknown>) => {
      if (settled) return;
      settled = true;
      logSyncRunner("runner.finish", {
        code,
        update: update ?? null,
      });
      if (update) {
        await updateSyncSession({ pid, ...update });
      }
      resolve(code);
    };

    websocket.addEventListener("open", () => {
      logSyncRunner("socket.open", {
        syncUrl,
        workspaceId: workspace.workspaceId,
      });
      websocket.send(JSON.stringify({
        type: "hello",
        workspaceId: workspace.workspaceId,
        client: "fide-cli",
      }));
      logSyncRunner("socket.send", {
        type: "hello",
        workspaceId: workspace.workspaceId,
      });
      websocket.send(JSON.stringify({
        type: "attach_workspace",
        workspaceId: workspace.workspaceId,
      }));
      logSyncRunner("socket.send", {
        type: "attach_workspace",
        workspaceId: workspace.workspaceId,
      });
    });

    websocket.addEventListener("message", async (event) => {
      const message = parseSyncMessage(event.data);
      logSyncRunner("socket.message", {
        message,
      });
      if (message.type === "connected") {
        await updateSyncSession({
          pid,
          status: "connected",
          syncBaseUrl: resolveSyncRuntimeParts(syncUrl).syncBaseUrl,
          syncEndpoint: typeof message.endpoint === "string" ? message.endpoint : syncEndpoint,
          error: null,
        });
        return;
      }
      if (message.type === "workspace_attached") {
        await updateSyncSession({
          pid,
          status: "attached",
          error: null,
        });
        try {
          await startProjectWatcher();
        } catch (error) {
          logSyncRunner("watcher.start.error", {
            error: error instanceof Error ? error.message : String(error),
          });
          await updateSyncSession({
            pid,
            status: "error",
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    });

    websocket.addEventListener("error", async () => {
      logSyncRunner("socket.error", {
        syncUrl,
      });
      await finish(1, {
        status: "error",
        error: `Unable to connect to sync service at ${syncUrl}.`,
        stoppedAt: new Date().toISOString(),
      });
      reject(new Error("Sync runner websocket error."));
    });

    websocket.addEventListener("close", async (event) => {
      logSyncRunner("socket.close", {
        code: event.code,
        reason: event.reason,
      });
      await finish(event.code === 1000 ? 0 : 1, {
        status: "stopped",
        error: event.code === 1000 ? null : `Sync connection closed (${event.code}${event.reason ? `: ${event.reason}` : ""}).`,
        stoppedAt: new Date().toISOString(),
      });
    });

    const stop = async () => {
      logSyncRunner("runner.stop.signal");
      try {
        if (watcher) {
          await watcher.close();
          watcher = null;
          logSyncRunner("watcher.closed");
        }
        websocket.close();
      } catch {
        // ignore
      }
      await finish(0, {
        status: "stopped",
        stoppedAt: new Date().toISOString(),
      });
    };

    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  });

  return await waitForEnd;
}

export async function runStartCommand(args: string[]): Promise<number> {
  const { flags } = parseArgs(args);
  const useJson = shouldUseJsonOutput(flags);
  if (flags.has("help") || flags.has("-h")) {
    console.log(renderStartHelp());
    return 0;
  }

  return await runDetachedStart(flags, useJson);
}
