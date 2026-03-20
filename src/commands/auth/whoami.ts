import { parseArgs, shouldUseJsonOutput } from "../../util/args.js";
import { renderHelp } from "../../util/help.js";
import { printJson } from "../../util/io.js";
import { okResponse } from "../../util/response.js";
import { createAuthApiClient } from "../../util/auth-api.js";
import { resolveAuthSettings } from "../../util/auth-settings.js";

function whoamiHelp(): string {
  return renderHelp({
    sections: [
      {
        title: "Usage",
        items: [
          "  fide auth whoami [--pretty|-p]",
        ],
      },
    ],
  });
}

export async function runAuthWhoami(args: string[]): Promise<number> {
  const { flags } = parseArgs(args);
  const useJson = shouldUseJsonOutput(flags);
  if (flags.has("help")) {
    console.log(whoamiHelp());
    return 0;
  }

  const auth = await resolveAuthSettings();
  if (!auth) {
    throw new Error("No Fide auth settings found. Run `fide auth login --base-url <url> --api-key <key>` or set FIDE_BASE_URL and FIDE_API_KEY.");
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
