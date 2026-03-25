import { getStringFlag, parseArgs, shouldUseJsonOutput } from "../util/args.js";
import { renderCommandHelp } from "../util/command-metadata.js";
import { resolveAuthSettings } from "../util/auth-settings.js";
import { printJson } from "../util/io.js";
import { resolveWorkspaceSelectionOrThrow } from "../util/workspace-settings.js";
import { startCommand } from "./metadata.js";

type SyncServerMessage = {
  type?: string;
  [key: string]: unknown;
};

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

export async function runStartCommand(args: string[]): Promise<number> {
  const { flags } = parseArgs(args);
  const useJson = shouldUseJsonOutput(flags);
  if (flags.has("help") || flags.has("-h")) {
    console.log(renderCommandHelp(startCommand));
    return 0;
  }

  const auth = await resolveAuthSettings(flags);
  if (!auth) {
    throw new Error("Missing auth. Run `fide login` first or set FIDE_API_BASE_URL and FIDE_ACCESS_TOKEN.");
  }

  const workspace = await resolveWorkspaceSelectionOrThrow(flags);
  const syncUrl = getStringFlag(flags, "sync-url")?.trim() || deriveSyncWebSocketUrl(auth.baseUrl);

  const websocket = new WebSocket(syncUrl);
  const startedAt = new Date().toISOString();

  const waitForEnd = new Promise<number>((resolve, reject) => {
    let connected = false;
    let closed = false;

    const closeWithCode = (code: number) => {
      if (closed) return;
      closed = true;
      try {
        websocket.close();
      } catch {
        // ignore
      }
      resolve(code);
    };

    const logMessage = (message: SyncServerMessage) => {
      if (useJson) {
        printJson({
          startedAt,
          syncUrl,
          workspaceId: workspace.workspaceId,
          message,
        });
        return;
      }

      if (message.type === "connected") {
        console.log(`Connected to ${syncUrl}`);
        return;
      }
      if (message.type === "hello_ack") {
        console.log(`Hello acknowledged for workspace ${workspace.workspaceId}`);
        return;
      }
      if (message.type === "workspace_attached") {
        console.log(`Workspace attached: ${workspace.workspaceId}`);
        console.log("Press Ctrl+C to stop.");
        return;
      }
      console.log(JSON.stringify(message));
    };

    websocket.addEventListener("open", () => {
      connected = true;
      websocket.send(JSON.stringify({
        type: "hello",
        workspaceId: workspace.workspaceId,
        client: "fide-cli",
      }));
      websocket.send(JSON.stringify({
        type: "attach_workspace",
        workspaceId: workspace.workspaceId,
      }));
    });

    websocket.addEventListener("message", (event) => {
      logMessage(parseSyncMessage(event.data));
    });

    websocket.addEventListener("error", () => {
      if (!connected) {
        reject(new Error(`Unable to connect to sync service at ${syncUrl}.`));
        return;
      }
      reject(new Error("Sync connection encountered a websocket error."));
    });

    websocket.addEventListener("close", (event) => {
      if (closed) return;
      closed = true;
      if (useJson) {
        printJson({
          startedAt,
          syncUrl,
          workspaceId: workspace.workspaceId,
          message: {
            type: "closed",
            code: event.code,
            reason: event.reason || null,
          },
        });
      } else {
        console.log(`Sync connection closed (${event.code}${event.reason ? `: ${event.reason}` : ""}).`);
      }
      resolve(event.code === 1000 ? 0 : 1);
    });

    const stop = () => {
      closeWithCode(0);
    };

    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  });

  return await waitForEnd;
}
