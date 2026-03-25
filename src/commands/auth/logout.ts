import { parseArgs, shouldUseJsonOutput } from "../../util/args.js";
import { renderCommandHelp } from "../../util/command-metadata.js";
import { printJson } from "../../util/io.js";
import { okResponse } from "../../util/response.js";
import { clearStoredAuthSettings } from "../../util/auth-settings.js";
import { resolveProfileSelection, resolveProfileSettingsPath } from "../../util/profile-settings.js";
import { authLogoutCommand } from "./metadata.js";

export async function runAuthLogout(args: string[]): Promise<number> {
  const { flags } = parseArgs(args);
  const useJson = shouldUseJsonOutput(flags);
  if (flags.has("help")) {
    console.log(renderCommandHelp(authLogoutCommand));
    return 0;
  }

  const profileSelection = await resolveProfileSelection(flags);
  if (!profileSelection) {
    throw new Error("No profile resolved for logout. A default profile is optional. Pass --profile <name>, set FIDE_PROFILE, use project .fide/settings.json, or run `fide login --profile <name>`.");
  }

  await clearStoredAuthSettings(profileSelection.profile);
  const payload = okResponse("auth-logout.v1", {
    cleared: true,
    profile: profileSelection.profile,
    userSettingsPath: resolveProfileSettingsPath(profileSelection.profile),
  }, {
    command: "fide logout",
  });

  if (useJson) {
    printJson(payload);
  } else {
    console.log(`Cleared saved Fide auth for profile ${profileSelection.profile}`);
  }
  return 0;
}
