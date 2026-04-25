import { parseArgs, shouldUseJsonOutput } from "../../util/command/args.js";
import {
  booleanKeysFromCommand,
  defineCommand,
  mergeBooleanKeySets,
  renderCommandHelp,
} from "../../util/command/command-metadata.js";
import { printJson } from "../../util/command/io.js";
import { formatPretty } from "../../util/command/pretty.js";
import { okResponse } from "../../util/command/response.js";
import { clearStoredAuthSettings } from "../../util/auth/auth-settings.js";
import { resolveSelectedAccount, resolveAccountSettingsPath } from "../../util/auth/account-settings.js";
export const authLogoutCommand = defineCommand({
  surface: "logout",
  command: "fide logout",
  outputType: "AuthLogoutOutput",
  summary: "Remove saved auth for the selected account",
  usage: ["fide logout [--pretty|-p]"],
  paramOrder: ["pretty"],
  params: {
    pretty: { kind: "boolean", shorthand: "-p", description: "Human-readable output" },
  },
});

const LOGOUT_PARSE_KEYS = mergeBooleanKeySets(booleanKeysFromCommand(authLogoutCommand));

export type AuthLogoutOutput = {
  ok: true;
  scope: "auth-logout.v1";
  command: "fide logout";
  cleared: boolean;
  accountId: string;
  userSettingsPath: string;
};

export async function runAuthLogout(args: string[]): Promise<number> {
  const { flags } = parseArgs(args, { booleanKeys: LOGOUT_PARSE_KEYS });
  const useJson = shouldUseJsonOutput(flags);
  if (flags.has("help")) {
    console.log(renderCommandHelp(authLogoutCommand));
    return 0;
  }

  const accountSelection = await resolveSelectedAccount(flags);
  if (!accountSelection) {
    throw new Error("No account resolved for logout. Set FIDE_ACCOUNT_ID, set FIDE_DIR/_meta.json with account.id, or run `fide login`.");
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
