import { parseArgs, shouldUseJsonOutput } from "../../util/args.js";
import { renderCommandHelp } from "../../util/command-metadata.js";
import { printJson } from "../../util/io.js";
import { okResponse } from "../../util/response.js";
import { clearStoredAuthSettings, resolveAuthSettingsPath } from "../../util/auth-settings.js";
import { authLogoutCommand } from "./metadata.js";

export async function runAuthLogout(args: string[]): Promise<number> {
  const { flags } = parseArgs(args);
  const useJson = shouldUseJsonOutput(flags);
  if (flags.has("help")) {
    console.log(renderCommandHelp(authLogoutCommand));
    return 0;
  }

  await clearStoredAuthSettings();
  const payload = okResponse("auth-logout.v1", {
    cleared: true,
    userSettingsPath: resolveAuthSettingsPath(),
  }, {
    command: "fide auth logout",
  });

  if (useJson) {
    printJson(payload);
  } else {
    console.log("Cleared saved Fide auth settings");
  }
  return 0;
}
