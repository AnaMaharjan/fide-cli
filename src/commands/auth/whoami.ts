import { parseArgs, shouldUseJsonOutput } from "../../util/args.js";
import { renderCommandHelp } from "../../util/command-metadata.js";
import { printJson } from "../../util/io.js";
import { okResponse } from "../../util/response.js";
import { createAuthApiClient } from "../../util/auth-api.js";
import { resolveAuthSettings } from "../../util/auth-settings.js";
import { authWhoamiCommand } from "./metadata.js";

export async function runAuthWhoami(args: string[]): Promise<number> {
  const { flags } = parseArgs(args);
  const useJson = shouldUseJsonOutput(flags);
  if (flags.has("help")) {
    console.log(renderCommandHelp(authWhoamiCommand));
    return 0;
  }

  const auth = await resolveAuthSettings();
  if (!auth) {
    throw new Error("No Fide auth settings found. Run `fide auth login --api-base-url <url> --api-key <key>` or set FIDE_API_BASE_URL and FIDE_API_KEY.");
  }

  const me = await createAuthApiClient(auth).me();
  const payload = okResponse("auth-whoami.v1", {
    baseUrl: auth.baseUrl,
    source: auth.source,
    user: me,
  }, {
    command: "fide auth whoami",
  });

  if (useJson) {
    printJson(payload);
  } else {
    console.log(`${me.user.id ?? me.auth.type}`);
  }
  return 0;
}
