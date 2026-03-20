import { getStringFlag, parseArgs, shouldUseJsonOutput } from "../../util/args.js";
import { renderHelp } from "../../util/help.js";
import { printJson } from "../../util/io.js";
import { okResponse } from "../../util/response.js";
import { createAuthApiClient, createBootstrapAuthApiClient } from "../../util/auth-api.js";
import { DEFAULT_FIDE_BASE_URL, writeStoredAuthSettings } from "../../util/auth-settings.js";

function loginHelp(): string {
  return renderHelp({
    sections: [
      {
        title: "Usage",
        items: [
          "  fide auth login --api-key <key> [--base-url <url>] [--pretty|-p]",
          "  fide auth login --email <email> [--base-url <url>] [--pretty|-p]",
          "  fide auth login --email <email> --otp <code> [--label <label>] [--base-url <url>] [--pretty|-p]",
        ],
      },
      {
        title: "Notes",
        items: [
          `  - --base-url defaults to ${DEFAULT_FIDE_BASE_URL}.`,
          "  - This command verifies the API key with /v1/me before saving it.",
          "  - --email starts an OTP flow through the API.",
          "  - --email with --otp exchanges the code for a Fide API key and saves it locally.",
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
  const email = getStringFlag(flags, "email");
  const otp = getStringFlag(flags, "otp");
  const label = getStringFlag(flags, "label");

  if (apiKey && email) {
    throw new Error("Use either --api-key or --email, not both");
  }

  if (email && !otp) {
    const client = createBootstrapAuthApiClient(baseUrl);
    const started = await client.startEmailAuth(email);
    const payload = okResponse("auth-login-email-start.v1", {
      baseUrl,
      email: started.email,
      sent: true,
      next: {
        verify: `fide auth login --email ${started.email} --otp <code>`,
      },
    }, {
      command: "fide auth login",
    });

    if (useJson) {
      printJson(payload);
    } else {
      console.log(`Sent OTP to ${started.email}`);
      console.log(`Next: fide auth login --email ${started.email} --otp <code>`);
    }
    return 0;
  }

  if (email && otp) {
    const bootstrap = createBootstrapAuthApiClient(baseUrl);
    const verified = await bootstrap.verifyEmailAuth({
      email,
      otp,
      ...(label ? { label } : {}),
    });
    const client = createAuthApiClient({ baseUrl, apiKey: verified.rawKey });
    const me = await client.me();
    await writeStoredAuthSettings({ baseUrl, apiKey: verified.rawKey });

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

  if (otp && !email) {
    throw new Error("Missing required flag: --email");
  }

  if (!apiKey) {
    throw new Error("Missing required flags: use --api-key or --email");
  }

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
