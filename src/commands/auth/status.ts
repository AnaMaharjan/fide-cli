import { parseArgs, shouldUseJsonOutput } from "../../util/args.js";
import { renderHelp } from "../../util/help.js";
import { printJson } from "../../util/io.js";
import { okResponse } from "../../util/response.js";
import { createAuthApiClient } from "../../util/auth-api.js";
import { readStoredAuthConfig, resolveAuthConfig, resolveAuthConfigPath } from "../../util/auth-config.js";

function statusHelp(): string {
  return renderHelp({
    sections: [
      {
        title: "Usage",
        items: [
          "  fide auth status [--pretty|-p]",
        ],
      },
    ],
  });
}

export async function runAuthStatus(args: string[]): Promise<number> {
  const { flags } = parseArgs(args);
  const useJson = shouldUseJsonOutput(flags);
  if (flags.has("help")) {
    console.log(statusHelp());
    return 0;
  }

  const stored = await readStoredAuthConfig();
  const resolved = await resolveAuthConfig();

  let remote: { ok: boolean; user?: unknown; error?: string } = { ok: false, error: "Not authenticated" };
  if (resolved) {
    try {
      const user = await createAuthApiClient(resolved).me();
      remote = { ok: true, user };
    } catch (error) {
      remote = { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  const payload = okResponse("auth-status.v1", {
    configured: Boolean(resolved),
    baseUrl: resolved?.baseUrl ?? null,
    source: resolved?.source ?? null,
    configPath: resolveAuthConfigPath(),
    storedConfigPresent: Boolean(stored),
    envConfigured: Boolean(process.env.FIDE_BASE_URL?.trim() && process.env.FIDE_API_KEY?.trim()),
    remote,
  }, {
    command: "fide auth status",
  });

  if (useJson) {
    printJson(payload);
  } else if (!resolved) {
    console.log("No Fide auth configured");
  } else if (remote.ok) {
    console.log(`Authenticated via ${resolved.source} to ${resolved.baseUrl}`);
  } else {
    console.log(`Configured via ${resolved.source} for ${resolved.baseUrl}, but remote auth failed`);
    console.log(remote.error ?? "Unknown auth error");
  }
  return 0;
}
