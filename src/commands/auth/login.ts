import { getStringFlag, parseArgs, shouldUseJsonOutput } from "../../util/args.js";
import { renderHelp } from "../../util/help.js";
import { printJson } from "../../util/io.js";
import { okResponse } from "../../util/response.js";
import { createAuthApiClient } from "../../util/auth-api.js";
import { DEFAULT_FIDE_BASE_URL, writeStoredAuthConfig } from "../../util/auth-config.js";

function loginHelp(): string {
  return renderHelp({
    sections: [
      {
        title: "Usage",
        items: [
          "  fide auth login --api-key <key> [--base-url <url>] [--pretty|-p]",
        ],
      },
      {
        title: "Notes",
        items: [
          `  - --base-url defaults to ${DEFAULT_FIDE_BASE_URL}.`,
          "  - This command verifies the API key with /v1/me before saving it.",
          "  - The saved settings are local to this machine.",
        ],
      },
    ],
  });
}

export async function runAuthLogin(args: string[]): Promise<number> {
  const { flags } = parseArgs(args);
  const useJson = shouldUseJsonOutput(flags);
  if (flags.has("help")) {
    console.log(loginHelp());
    return 0;
  }

  const baseUrl = getStringFlag(flags, "base-url") ?? DEFAULT_FIDE_BASE_URL;
  const apiKey = getStringFlag(flags, "api-key");
  if (!apiKey) {
    throw new Error("Missing required flag: --api-key");
  }

  const client = createAuthApiClient({ baseUrl, apiKey });
  const me = await client.me();
  await writeStoredAuthConfig({ baseUrl, apiKey });

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
