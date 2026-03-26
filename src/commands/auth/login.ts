import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output, stderr } from "node:process";
import { getStringFlag, parseArgs, shouldUseJsonOutput } from "../../util/command/args.js";
import { renderCommandHelp } from "../../util/command/command-metadata.js";
import { printJson } from "../../util/command/io.js";
import { okResponse } from "../../util/command/response.js";
import { formatPretty } from "../../util/command/pretty.js";
import { createAuthApiClient } from "../../util/auth/auth-api.js";
import { resolveApiBaseUrl, writeStoredAuthSettings } from "../../util/auth/auth-settings.js";
import { startAgentAuthLoopbackServer } from "../../util/auth/auth-loopback.js";
import { openBrowser } from "../../util/auth/browser.js";
import { assertAccountId } from "../../util/ids/public-ids.js";
import { writeProjectPointerSettings } from "../../util/project/project-pointer.js";
import { authLoginCommand } from "./metadata.js";

function renderLoginHelp(): string {
  const activeEnv: string[] = [];
  if (process.env.FIDE_API_BASE_URL?.trim()) {
    activeEnv.push(`  FIDE_API_BASE_URL=${process.env.FIDE_API_BASE_URL.trim()}`);
  }
  if (process.env.FIDE_WORKSPACE_URL?.trim()) {
    activeEnv.push(`  FIDE_WORKSPACE_URL=${process.env.FIDE_WORKSPACE_URL.trim()}`);
  }

  if (activeEnv.length === 0) {
    return renderCommandHelp(authLoginCommand);
  }

  return `${renderCommandHelp(authLoginCommand)}\n\nActive Env:\n${activeEnv.join("\n")}`;
}

export async function runAuthLogin(args: string[]): Promise<number> {
  const { flags } = parseArgs(args);
  const useJson = shouldUseJsonOutput(flags);
  if (flags.has("help")) {
    console.log(renderLoginHelp());
    return 0;
  }

  const baseUrl = await resolveApiBaseUrl(getStringFlag(flags, "api-base-url"), flags);
  const agentName = getStringFlag(flags, "agent-name") ?? "My Agent";

  const loopback = await startAgentAuthLoopbackServer();
  try {
    const client = createAuthApiClient({ baseUrl });
    const created = await client.createAgentAuthRequest({
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

    const me = await createAuthApiClient({
      baseUrl,
      accessToken: exchanged.result.accessToken,
    }).me();
    const accountId = assertAccountId(me.user.id ?? "");
    const workspaceSummary = await createAuthApiClient({
      baseUrl,
      accessToken: exchanged.result.accessToken,
    }).getWorkspace(exchanged.result.workspaceId);

    await writeStoredAuthSettings(accountId, { accessToken: exchanged.result.accessToken });
    const projectSettingsPath = await writeProjectPointerSettings({
      account: {
        id: accountId,
        name: created.request.agentLabel ?? agentName,
      },
      workspace: {
        id: exchanged.result.workspaceId,
        name: workspaceSummary.name,
      },
    });

    const payload = okResponse("auth-login.v1", {
      baseUrl,
      account: {
        id: accountId,
        name: created.request.agentLabel ?? agentName,
      },
      source: "account",
      user: me,
      workspace: {
        id: exchanged.result.workspaceId,
        name: workspaceSummary.name,
      },
      projectSettingsPath,
      requestId: created.request.id,
      loopback: Boolean(callback && callback.requestId),
    }, {
      command: "fide login",
    });

    if (useJson) {
      printJson(payload);
    } else {
      console.log(formatPretty("auth-login.v1", payload));
    }
    return 0;
  } finally {
    await loopback.close();
  }
}
