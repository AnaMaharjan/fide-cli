import { parseArgs, shouldUseJsonOutput } from "../../util/args.js";
import { renderCommandHelp } from "../../util/command-metadata.js";
import { printJson } from "../../util/io.js";
import { okResponse } from "../../util/response.js";
import { createAuthApiClient } from "../../util/auth-api.js";
import { readStoredAuthSettings, resolveAuthSettings } from "../../util/auth-settings.js";
import { resolveProfileAuthPath, resolveProfileSelection } from "../../util/profile-settings.js";
import { authStatusCommand } from "./metadata.js";

export async function runAuthStatus(args: string[]): Promise<number> {
  const { flags } = parseArgs(args);
  const useJson = shouldUseJsonOutput(flags);
  if (flags.has("help")) {
    console.log(renderCommandHelp(authStatusCommand));
    return 0;
  }

  const profileSelection = await resolveProfileSelection(flags);
  const stored = profileSelection ? await readStoredAuthSettings(profileSelection.profile) : null;
  let resolved = null;
  let resolutionError: string | null = null;
  try {
    resolved = await resolveAuthSettings(flags);
  } catch (error) {
    resolutionError = error instanceof Error ? error.message : String(error);
  }

  let remote: { ok: boolean; error?: string } = { ok: false, error: "Not authenticated" };
  if (resolved) {
    try {
      await createAuthApiClient(resolved).me();
      remote = { ok: true };
    } catch (error) {
      remote = { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  const resolutionHint = !resolved
    ? "A default profile is optional. Use --profile <name>, FIDE_PROFILE, project .fide/settings.json, or run `fide login --profile <name>`."
    : null;

  const payload = okResponse("auth-status.v1", {
    configured: Boolean(resolved),
    baseUrl: resolved?.baseUrl ?? null,
    source: resolved?.source ?? null,
    profile: profileSelection?.profile ?? null,
    userSettingsPath: profileSelection ? resolveProfileAuthPath(profileSelection.profile) : null,
    storedSettingsPresent: Boolean(stored),
    envConfigured: Boolean(process.env.FIDE_API_BASE_URL?.trim() && process.env.FIDE_API_KEY?.trim()),
    resolutionError,
    resolutionHint,
    remote,
  }, {
    command: "fide auth status",
  });

  if (useJson) {
    printJson(payload);
  } else if (!resolved) {
    console.log(resolutionError ?? "No Fide auth profile resolved. Pass --profile <name>, set FIDE_PROFILE, use project .fide/settings.json, or run `fide login --profile <name>`.");
  } else if (remote.ok) {
    console.log(`Authenticated via ${resolved.source} to ${resolved.baseUrl}`);
  } else {
    console.log(`Configured via ${resolved.source} for ${resolved.baseUrl}, but remote auth failed`);
    console.log(remote.error ?? "Unknown auth error");
  }
  return 0;
}
