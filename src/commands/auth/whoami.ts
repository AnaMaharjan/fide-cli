import { parseArgs, shouldUseJsonOutput } from "../../util/command/args.js";
import { renderCommandHelp } from "../../util/command/command-metadata.js";
import { printJson } from "../../util/command/io.js";
import { formatPretty } from "../../util/command/pretty.js";
import { okResponse } from "../../util/command/response.js";
import { createAuthApiClient } from "../../util/auth/auth-api.js";
import { resolveAuthSettings } from "../../util/auth/auth-settings.js";
import { authWhoamiCommand } from "./metadata.js";

export async function runAuthWhoami(args: string[]): Promise<number> {
  const { flags } = parseArgs(args);
  const useJson = shouldUseJsonOutput(flags);
  if (flags.has("help")) {
    console.log(renderCommandHelp(authWhoamiCommand));
    return 0;
  }

  const auth = await resolveAuthSettings(flags);
  if (!auth) {
    throw new Error("No Fide auth account resolved. Set FIDE_ACCOUNT_ID, set project .fide/settings.json with account.id, or run `fide login`.");
  }

  const me = await createAuthApiClient(auth).me();
  const payload = okResponse("auth-whoami.v1", {
    baseUrl: auth.baseUrl,
    source: auth.source,
    user: me,
  }, {
    command: "fide whoami",
  });

  if (useJson) {
    printJson(payload);
  } else {
    console.log(formatPretty("auth-whoami.v1", payload));
  }
  return 0;
}
