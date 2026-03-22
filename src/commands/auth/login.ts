import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { getStringFlag, parseArgs, shouldUseJsonOutput } from "../../util/args.js";
import { renderCommandHelp } from "../../util/command-metadata.js";
import { printJson } from "../../util/io.js";
import { okResponse } from "../../util/response.js";
import { createAuthApiClient } from "../../util/auth-api.js";
import { resolveApiBaseUrl, writeStoredAuthSettings } from "../../util/auth-settings.js";
import { startAgentAuthLoopbackServer } from "../../util/auth-loopback.js";
import { openBrowser } from "../../util/browser.js";
import { resolveWorkspaceSelection, writeStoredWorkspaceSelection } from "../../util/workspace-settings.js";
import { authLoginCommand } from "./metadata.js";

export async function runAuthLogin(args: string[]): Promise<number> {
  const { flags } = parseArgs(args);
  const useJson = shouldUseJsonOutput(flags);
  if (flags.has("help")) {
    console.log(renderCommandHelp(authLoginCommand));
    return 0;
  }

  const baseUrl = await resolveApiBaseUrl(getStringFlag(flags, "api-base-url"));
  const apiKey = getStringFlag(flags, "api-key");
  const agentName = getStringFlag(flags, "agent-name") ?? "My Agent";
  const useWeb = flags.has("web");

  if (useWeb && apiKey) {
    throw new Error("Invalid auth login flags. Use either --web or --api-key <key>, not both.");
  }

  if (apiKey) {
    const client = createAuthApiClient({ baseUrl, apiKey });
    const me = await client.me();
    await writeStoredAuthSettings({ baseUrl, apiKey });

    const payload = okResponse("auth-login.v1", {
      baseUrl,
      source: "settings",
      user: me,
    }, {
      command: "fide auth login",
    });

    if (useJson) {
      printJson(payload);
    } else {
      console.log(`Saved auth for ${me.user.id ?? me.auth.type} at ${baseUrl}`);
    }
    return 0;
  }

  const loopback = await startAgentAuthLoopbackServer();
  try {
    const workspaceSelection = await resolveWorkspaceSelection(flags);
    const client = createAuthApiClient({ baseUrl });
    const created = await client.createAgentAuthRequest({
      requestedWorkspaceId: workspaceSelection?.workspaceId ?? null,
      loopbackUrl: loopback.callbackUrl,
      agentName: agentName ?? null,
      expiresInSeconds: 60 * 15,
    });

    const opened = openBrowser(created.agentLoginUrl);
    const out = useJson ? console.error : console.log;
    out("Starting browser login to authorize a new agent for this CLI.");
    if (opened) {
      out("Opening browser now. You can also use this URL directly:");
    } else {
      out("Browser auto-open was unavailable on this machine. Use this URL:");
    }
    out(created.agentLoginUrl);
    out("Waiting for browser login. Press Ctrl+C to cancel.");

    let callback = await loopback.waitForCallback(5 * 60 * 1000);
    if (!callback) {
      const rl = createInterface({ input, output });
      try {
        const exchangeCode = (await rl.question("Paste exchange code from the browser: ")).trim();
        callback = { requestId: created.request.id, exchangeCode: exchangeCode || null };
      } finally {
        rl.close();
      }
    }

    if (!callback?.exchangeCode) {
      throw new Error("Missing exchange code. Finish browser authorization and provide the fallback code.");
    }

    const exchanged = await client.exchangeAgentAuthRequest({
      requestId: created.request.id,
      exchangeCode: callback.exchangeCode,
    });
    await writeStoredAuthSettings({ baseUrl, apiKey: exchanged.result.apiKey });
    await writeStoredWorkspaceSelection(exchanged.result.workspaceId);

    const me = await createAuthApiClient({
      baseUrl,
      apiKey: exchanged.result.apiKey,
    }).me();

    const payload = okResponse("auth-login.v1", {
      baseUrl,
      source: "settings",
      user: me,
      workspaceId: exchanged.result.workspaceId,
      requestId: created.request.id,
      loopback: Boolean(callback && callback.requestId),
    }, {
      command: "fide auth login",
    });

    if (useJson) {
      printJson(payload);
    } else {
      console.log(`Saved agent auth for workspace ${exchanged.result.workspaceId} at ${baseUrl}`);
    }
    return 0;
  } finally {
    await loopback.close();
  }
}
