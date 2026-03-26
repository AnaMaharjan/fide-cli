import { parseArgs, shouldUseJsonOutput } from "../util/command/args.js";
import {
  booleanKeysFromCommand,
  defineCommand,
  mergeBooleanKeySets,
  renderCommandHelp,
} from "../util/command/command-metadata.js";
import { printJson } from "../util/command/io.js";
import { formatPretty } from "../util/command/pretty.js";
import { okResponse } from "../util/command/response.js";
import { clearSyncSession, isProcessAlive, readSyncSession, writeSyncSession } from "../util/workspace/sync-session.js";
export const stopCommand = defineCommand({
  surface: "stop",
  command: "fide stop",
  outputType: "StopOutput",
  summary: "Stop the background sync agent for this device",
  usage: ["fide stop [--pretty|-p]"],
  paramOrder: ["pretty"],
  params: {
    pretty: { kind: "boolean", shorthand: "-p", description: "Human-readable output" },
  },
});

const STOP_PARSE_KEYS = mergeBooleanKeySets(booleanKeysFromCommand(stopCommand));

export type StopOutput = {
  ok: true;
  scope: "stop.v1";
  command: "fide stop";
  stopped: boolean;
  pid?: number;
  reason?: string;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runStopCommand(args: string[]): Promise<number> {
  const { flags } = parseArgs(args, { booleanKeys: STOP_PARSE_KEYS });
  const useJson = shouldUseJsonOutput(flags);
  if (flags.has("help") || flags.has("-h")) {
    console.log(renderCommandHelp(stopCommand));
    return 0;
  }

  const session = await readSyncSession();
  if (!session) {
    const payload = okResponse("stop.v1", {
      stopped: false,
      reason: "not_running",
    }, { command: "fide stop" });
    if (useJson) {
      printJson(payload);
    } else {
      console.log(formatPretty("stop.v1", payload));
    }
    return 0;
  }

  const pid = session.pid;
  if (isProcessAlive(pid)) {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      // ignore and continue to fallback
    }

    for (let index = 0; index < 10; index += 1) {
      if (!isProcessAlive(pid)) break;
      await sleep(100);
    }

    if (isProcessAlive(pid)) {
      process.kill(pid, "SIGKILL");
      for (let index = 0; index < 10; index += 1) {
        if (!isProcessAlive(pid)) break;
        await sleep(100);
      }
    }
  }

  const stopped = !isProcessAlive(pid);
  if (stopped) {
    await writeSyncSession({
      ...session,
      status: "stopped",
      stoppedAt: new Date().toISOString(),
      error: null,
    });
  }

  const payload = okResponse("stop.v1", {
    stopped,
    pid,
  }, { command: "fide stop" });

  if (useJson) {
    printJson(payload);
  } else {
    console.log(formatPretty("stop.v1", payload));
  }

  if (stopped) {
    await clearSyncSession();
  }

  return stopped ? 0 : 1;
}
