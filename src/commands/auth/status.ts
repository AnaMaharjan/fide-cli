import { parseArgs, shouldUseJsonOutput } from "../../util/args.js";
import { renderCommandHelp } from "../../util/command-metadata.js";
import { printJson } from "../../util/io.js";
import { okResponse } from "../../util/response.js";
import { createAuthApiClient } from "../../util/auth-api.js";
import { readStoredAuthSettings, resolveAuthSettings, resolveAuthSettingsPath } from "../../util/auth-settings.js";
import { authStatusCommand } from "./metadata.js";

export async function runAuthStatus(args: string[]): Promise<number> {
  const { flags } = parseArgs(args);
  const useJson = shouldUseJsonOutput(flags);
  if (flags.has("help")) {
    console.log(renderCommandHelp(authStatusCommand));
    return 0;
  }

  const stored = await readStoredAuthSettings();
  const resolved = await resolveAuthSettings();

  let remote: { ok: boolean; error?: string } = { ok: false, error: "Not authenticated" };
  if (resolved) {
    try {
      await createAuthApiClient(resolved).me();
      remote = { ok: true };
    } catch (error) {
      remote = { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  const payload = okResponse("auth-status.v1", {
    configured: Boolean(resolved),
    baseUrl: resolved?.baseUrl ?? null,
    source: resolved?.source ?? null,
    userSettingsPath: resolveAuthSettingsPath(),
    storedSettingsPresent: Boolean(stored),
    envConfigured: Boolean(process.env.FIDE_BASE_URL?.trim() && process.env.FIDE_API_KEY?.trim()),
    remote,
  }, {
    command: "fide auth status",
  });

  if (useJson) {
    printJson(payload);
  } else if (!resolved) {
    console.log("No Fide auth settings found");
  } else if (remote.ok) {
    console.log(`Authenticated via ${resolved.source} to ${resolved.baseUrl}`);
  } else {
    console.log(`Configured via ${resolved.source} for ${resolved.baseUrl}, but remote auth failed`);
    console.log(remote.error ?? "Unknown auth error");
  }
  return 0;
}
