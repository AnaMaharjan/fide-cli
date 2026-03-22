import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output, stderr } from "node:process";
import { getStringFlag, parseArgs, shouldUseJsonOutput } from "../../util/args.js";
import { renderCommandHelp } from "../../util/command-metadata.js";
import { printJson } from "../../util/io.js";
import { okResponse } from "../../util/response.js";
import { createAuthApiClient } from "../../util/auth-api.js";
import { resolveApiBaseUrl, writeStoredAuthSettings } from "../../util/auth-settings.js";
import { startAgentAuthLoopbackServer } from "../../util/auth-loopback.js";
import { openBrowser } from "../../util/browser.js";
import { resolveWorkspaceSelection, writeStoredWorkspaceSelection } from "../../util/workspace-settings.js";
import { clearDefaultProfile, setDefaultProfile } from "../../util/profile-settings.js";
import { authLoginCommand } from "./metadata.js";

export async function runAuthLogin(args: string[]): Promise<number> {
  const { flags } = parseArgs(args);
  const useJson = shouldUseJsonOutput(flags);
  if (flags.has("help")) {
    console.log(renderCommandHelp(authLoginCommand));
    return 0;
  }

  const profile = getStringFlag(flags, "profile") ?? "default";
  const baseUrl = await resolveApiBaseUrl(getStringFlag(flags, "api-base-url"), flags);
  const apiKey = getStringFlag(flags, "api-key");
  const agentName = getStringFlag(flags, "agent-name") ?? "My Agent";
  const useWeb = flags.has("web");
  const setDefault = flags.has("set-default");
  const clearDefault = flags.has("clear-default");

  if (useWeb && apiKey) {
    throw new Error("Invalid auth login flags. Use either --web or --api-key <key>, not both.");
  }
  if (setDefault && clearDefault) {
    throw new Error("Invalid auth login flags. Use either --set-default or --clear-default, not both.");
  }
  if (clearDefault) {
    if (flags.has("profile") || apiKey || useWeb || flags.has("workspace") || flags.has("agent-name")) {
      throw new Error("Invalid auth login flags. --clear-default only clears the saved default profile and cannot be combined with login options.");
    }
    await clearDefaultProfile();
    if (useJson) {
      printJson(okResponse("auth-login.v1", {
        clearedDefaultProfile: true,
      }, {
        command: "fide login",
      }));
    } else {
      console.log("Cleared default profile.");
    }
    return 0;
  }

  if (apiKey) {
    const client = createAuthApiClient({ baseUrl, apiKey });
    const me = await client.me();
    await writeStoredAuthSettings(profile, { baseUrl, apiKey });
    if (setDefault) {
      await setDefaultProfile(profile);
    }

    const payload = okResponse("auth-login.v1", {
      baseUrl,
      profile,
      source: "profile",
      user: me,
    }, {
      command: "fide login",
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
    out("Authorize a new agent for this CLI");
    out("");
    if (opened) {
      out("Opening browser now.");
      out("If needed, open this URL on any device:");
    } else {
      out("Open this URL on any device:");
    }
    out(created.agentLoginUrl);
    out("");
    out("After you click Authorize in the browser:");
    out("- automatic local handoff may complete this for you");
    out("- or paste the 8-digit code shown on the browser page");
    out("");
    out("Press Ctrl+C to cancel.");
    out("");

    const rl = createInterface({
      input,
      output: useJson ? stderr : output,
    });

    let callback: { requestId: string | null; exchangeCode: string | null } | null = null;
    try {
      const manualEntry = rl
        .question("8-digit code: ")
        .then((value) => ({
          source: "manual" as const,
          value: {
            requestId: created.request.id,
            exchangeCode: value.trim() || null,
          },
        }))
        .catch(() => ({
          source: "manual" as const,
          value: null,
        }));

      const result = await Promise.race([
        loopback.waitForCallback(15 * 60 * 1000).then((value) => ({
          source: "loopback" as const,
          value,
        })),
        manualEntry,
      ]);

      callback = result.value;
    } finally {
      rl.close();
    }

    if (!callback?.exchangeCode) {
      throw new Error("Missing exchange code. Finish browser authorization and provide the fallback code.");
    }

    const exchanged = await client.exchangeAgentAuthRequest({
      requestId: created.request.id,
      exchangeCode: callback.exchangeCode,
    });
    await writeStoredAuthSettings(profile, { baseUrl, apiKey: exchanged.result.apiKey });
    await writeStoredWorkspaceSelection(profile, exchanged.result.workspaceId);
    if (setDefault) {
      await setDefaultProfile(profile);
    }

    const me = await createAuthApiClient({
      baseUrl,
      apiKey: exchanged.result.apiKey,
    }).me();

    const payload = okResponse("auth-login.v1", {
      baseUrl,
      profile,
      source: "profile",
      user: me,
      workspaceId: exchanged.result.workspaceId,
      requestId: created.request.id,
      loopback: Boolean(callback && callback.requestId),
    }, {
      command: "fide login",
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
