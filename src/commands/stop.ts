import { parseArgs, shouldUseJsonOutput } from "../util/args.js";
import { renderCommandHelp } from "../util/command-metadata.js";
import { printJson } from "../util/io.js";
import { formatPretty } from "../util/pretty.js";
import { okResponse } from "../util/response.js";
import { clearSyncSession, isProcessAlive, readSyncSession, writeSyncSession } from "../util/sync-session.js";
import { stopCommand } from "./metadata.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runStopCommand(args: string[]): Promise<number> {
  const { flags } = parseArgs(args);
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
