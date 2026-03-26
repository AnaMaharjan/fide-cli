import { parseArgs, shouldUseJsonOutput } from "../../util/args.js";
import { renderCommandHelp } from "../../util/command-metadata.js";
import { printJson } from "../../util/io.js";
import { formatPretty } from "../../util/pretty.js";
import { okResponse } from "../../util/response.js";
import { clearStoredAuthSettings } from "../../util/auth-settings.js";
import { resolveSelectedAccount, resolveAccountSettingsPath } from "../../util/account-settings.js";
import { authLogoutCommand } from "./metadata.js";

export async function runAuthLogout(args: string[]): Promise<number> {
  const { flags } = parseArgs(args);
  const useJson = shouldUseJsonOutput(flags);
  if (flags.has("help")) {
    console.log(renderCommandHelp(authLogoutCommand));
    return 0;
  }

  const accountSelection = await resolveSelectedAccount(flags);
  if (!accountSelection) {
    throw new Error("No account resolved for logout. Set FIDE_ACCOUNT_ID, set project .fide/settings.json with account.id, or run `fide login`.");
  }

  await clearStoredAuthSettings(accountSelection.accountId);
  const payload = okResponse("auth-logout.v1", {
    cleared: true,
    accountId: accountSelection.accountId,
    userSettingsPath: resolveAccountSettingsPath(accountSelection.accountId),
  }, {
    command: "fide logout",
  });

  if (useJson) {
    printJson(payload);
  } else {
    console.log(formatPretty("auth-logout.v1", payload));
  }
  return 0;
}
