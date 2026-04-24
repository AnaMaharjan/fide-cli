import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { getStringFlag, hasFlag, parseArgs, shouldUseJsonOutput } from "../util/command/args.js";
import {
  booleanKeysFromCommand,
  defineCommand,
  mergeBooleanKeySets,
  renderCommandHelp,
} from "../util/command/command-metadata.js";
import { printJson } from "../util/command/io.js";
import { formatPretty } from "../util/command/pretty.js";
import { okResponse } from "../util/command/response.js";

const DEFAULT_DAEMON_HOST = "127.0.0.1";
const DEFAULT_DAEMON_PORT = 20225;
const require = createRequire(import.meta.url);

export const daemonStartCommand = defineCommand({
  surface: "daemon.start",
  command: "fide daemon start",
  outputType: "DaemonStartOutput",
  summary: "Start the local Fide daemon",
  usage: ["fide daemon start [--foreground] [--remote-url <url>] [--host <host>] [--port <port>] [--pretty|-p]"],
  paramOrder: ["foreground", "remote-url", "host", "port", "pretty"],
  params: {
    foreground: { kind: "boolean", description: "Run the daemon in the current terminal instead of detaching" },
    "remote-url": { kind: "string", description: "Remote daemon websocket URL. Sets FIDE_DAEMON_REMOTE_URL.", valueLabel: "<url>" },
    host: { kind: "string", description: "Local daemon HTTP host. Defaults to FIDE_DAEMON_HOST or 127.0.0.1.", valueLabel: "<host>" },
    port: { kind: "string", description: "Local daemon HTTP port. Defaults to FIDE_DAEMON_PORT or 20225.", valueLabel: "<port>" },
    pretty: { kind: "boolean", shorthand: "-p", description: "Human-readable output" },
  },
  notes: [
    "The daemon package is a dependency of the CLI; no separate daemon download is required.",
    "Detached mode starts the daemon and returns after the local /health endpoint responds or a short readiness timeout expires.",
    "Daemon state is persisted in ~/.fide/state.sqlite by default.",
  ],
});

const DAEMON_START_PARSE_KEYS = mergeBooleanKeySets(booleanKeysFromCommand(daemonStartCommand));
export const daemonStopCommand = defineCommand({
  surface: "daemon.stop",
  command: "fide daemon stop",
  outputType: "DaemonStopOutput",
  summary: "Stop the local Fide daemon",
  usage: ["fide daemon stop [--host <host>] [--port <port>] [--pretty|-p]"],
  paramOrder: ["host", "port", "pretty"],
  params: {
    host: { kind: "string", description: "Local daemon HTTP host. Defaults to FIDE_DAEMON_HOST or 127.0.0.1.", valueLabel: "<host>" },
    port: { kind: "string", description: "Local daemon HTTP port. Defaults to FIDE_DAEMON_PORT or 20225.", valueLabel: "<port>" },
    pretty: { kind: "boolean", shorthand: "-p", description: "Human-readable output" },
  },
  notes: [
    "Uses the daemon's local shutdown endpoint for graceful stop.",
    "Returns success if daemon is already stopped.",
  ],
});
const DAEMON_STOP_PARSE_KEYS = mergeBooleanKeySets(booleanKeysFromCommand(daemonStopCommand));

export type DaemonStartOutput = {
  ok: true;
  scope: "daemon-start.v1";
  command: "fide daemon start";
  started: boolean;
  alreadyRunning: boolean;
  foreground: boolean;
  pid?: number;
  host: string;
  port: number;
  localApiBaseUrl: string;
  ready: boolean;
};
export type DaemonStopOutput = {
  ok: true;
  scope: "daemon-stop.v1";
  command: "fide daemon stop";
  stopped: boolean;
  alreadyStopped: boolean;
  host: string;
  port: number;
  localApiBaseUrl: string;
};

function parsePort(raw: string | null): number {
  if (!raw) {
    return Number.parseInt(process.env.FIDE_DAEMON_PORT ?? "", 10) || DEFAULT_DAEMON_PORT;
  }
  const value = Number.parseInt(raw, 10);
  if (!Number.isInteger(value) || value < 0 || value > 65535) {
    throw new Error(`Invalid daemon port: ${raw}`);
  }
  return value;
}

function daemonHealthUrl(host: string, port: number): string {
  return `http://${host}:${port}/health`;
}

async function fetchDaemonHealth(host: string, port: number): Promise<Record<string, unknown> | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1_000);
    const res = await fetch(daemonHealthUrl(host, port), {
      signal: controller.signal,
      headers: { accept: "application/json" },
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    return await res.json() as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function requestDaemonShutdown(host: string, port: number): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2_000);
    const res = await fetch(`http://${host}:${port}/shutdown`, {
      method: "POST",
      signal: controller.signal,
      headers: { accept: "application/json" },
    });
    clearTimeout(timeout);
    return res.ok;
  } catch {
    return false;
  }
}

async function waitForDaemonHealth(host: string, port: number, timeoutMs = 5_000): Promise<Record<string, unknown> | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const health = await fetchDaemonHealth(host, port);
    if (health?.ok === true) {
      return health;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return null;
}

function resolveDaemonEntryPath(): string {
  return require.resolve("@chris-test/daemon");
}

function printDaemonStartResult(useJson: boolean, payload: Omit<DaemonStartOutput, "ok" | "scope" | "command">): void {
  const response = okResponse("daemon-start.v1", payload, { command: "fide daemon start" });
  if (useJson) {
    printJson(response);
    return;
  }
  console.log(formatPretty("daemon-start.v1", response));
}
function printDaemonStopResult(useJson: boolean, payload: Omit<DaemonStopOutput, "ok" | "scope" | "command">): void {
  const response = okResponse("daemon-stop.v1", payload, { command: "fide daemon stop" });
  if (useJson) {
    printJson(response);
    return;
  }
  console.log(formatPretty("daemon-stop.v1", response));
}

function buildDaemonEnv(flags: Map<string, string | boolean>, host: string, port: number): NodeJS.ProcessEnv {
  return {
    ...process.env,
    FIDE_DAEMON_HOST: host,
    FIDE_DAEMON_PORT: String(port),
    ...(getStringFlag(flags, "remote-url") ? { FIDE_DAEMON_REMOTE_URL: getStringFlag(flags, "remote-url") as string } : {}),
  };
}

async function runDaemonStart(args: string[]): Promise<number> {
  const { flags } = parseArgs(args, { booleanKeys: DAEMON_START_PARSE_KEYS });
  const useJson = shouldUseJsonOutput(flags);
  if (flags.has("help") || flags.has("-h")) {
    console.log(renderCommandHelp(daemonStartCommand));
    return 0;
  }

  const host = getStringFlag(flags, "host") ?? process.env.FIDE_DAEMON_HOST?.trim() ?? DEFAULT_DAEMON_HOST;
  const port = parsePort(getStringFlag(flags, "port"));
  const localApiBaseUrl = `http://${host}:${port}`;
  const foreground = hasFlag(flags, "foreground");
  const existing = await fetchDaemonHealth(host, port);
  if (existing?.ok === true) {
    printDaemonStartResult(useJson, {
      started: false,
      alreadyRunning: true,
      foreground,
      pid: typeof existing.pid === "number" ? existing.pid : undefined,
      host,
      port,
      localApiBaseUrl,
      ready: true,
    });
    return 0;
  }

  const daemonEntryPath = resolveDaemonEntryPath();
  const child = spawn(process.execPath, [daemonEntryPath], {
    cwd: process.cwd(),
    detached: !foreground,
    stdio: foreground ? "inherit" : "ignore",
    env: buildDaemonEnv(flags, host, port),
  });

  if (foreground) {
    return await new Promise((resolve) => {
      child.on("exit", (code) => resolve(code ?? 0));
      child.on("error", (error) => {
        console.error(error.message);
        resolve(1);
      });
    });
  }

  child.unref();
  const health = await waitForDaemonHealth(host, port);
  printDaemonStartResult(useJson, {
    started: true,
    alreadyRunning: false,
    foreground: false,
    pid: typeof health?.pid === "number" ? health.pid : child.pid,
    host,
    port,
    localApiBaseUrl,
    ready: Boolean(health),
  });
  return health ? 0 : 1;
}

async function runDaemonStop(args: string[]): Promise<number> {
  const { flags } = parseArgs(args, { booleanKeys: DAEMON_STOP_PARSE_KEYS });
  const useJson = shouldUseJsonOutput(flags);
  if (flags.has("help") || flags.has("-h")) {
    console.log(renderCommandHelp(daemonStopCommand));
    return 0;
  }

  const host = getStringFlag(flags, "host") ?? process.env.FIDE_DAEMON_HOST?.trim() ?? DEFAULT_DAEMON_HOST;
  const port = parsePort(getStringFlag(flags, "port"));
  const localApiBaseUrl = `http://${host}:${port}`;
  const existing = await fetchDaemonHealth(host, port);
  if (!existing?.ok) {
    printDaemonStopResult(useJson, {
      stopped: true,
      alreadyStopped: true,
      host,
      port,
      localApiBaseUrl,
    });
    return 0;
  }

  const sent = await requestDaemonShutdown(host, port);
  if (!sent) {
    throw new Error(`Failed to request daemon shutdown at ${localApiBaseUrl}.`);
  }
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const health = await fetchDaemonHealth(host, port);
    if (!health?.ok) {
      printDaemonStopResult(useJson, {
        stopped: true,
        alreadyStopped: false,
        host,
        port,
        localApiBaseUrl,
      });
      return 0;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error("Daemon is still stopping. Try again in a moment.");
}

function renderDaemonHelp(): string {
  return [
    "fide daemon",
    "",
    "Usage",
    "  fide daemon <command> [flags]",
    "",
    "Commands",
    `  start  ${daemonStartCommand.summary}`,
    `  stop   ${daemonStopCommand.summary}`,
    "",
    "Examples",
    "  fide daemon start",
    "  fide daemon stop",
    "  fide daemon start --foreground",
    "  fide daemon start --remote-url wss://example.com/ws",
  ].join("\n");
}

export async function runDaemonCommand(command: string | undefined, args: string[]): Promise<number> {
  if (!command || command === "--help" || command === "-h") {
    console.log(renderDaemonHelp());
    return 0;
  }
  if (command === "start") {
    return await runDaemonStart(args);
  }
  if (command === "stop") {
    return await runDaemonStop(args);
  }
  throw new Error(`Unknown daemon command: ${command}. Run \`fide daemon --help\` to see available commands.`);
}
