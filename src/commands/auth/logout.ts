import { parseArgs, shouldUseJsonOutput } from "../../util/args.js";
import { renderHelp } from "../../util/help.js";
import { printJson } from "../../util/io.js";
import { okResponse } from "../../util/response.js";
import { clearStoredAuthConfig, resolveAuthConfigPath } from "../../util/auth-config.js";

function logoutHelp(): string {
  return renderHelp({
    sections: [
      {
        title: "Usage",
        items: [
          "  fide auth logout [--pretty|-p]",
        ],
      },
    ],
  });
}

export async function runAuthLogout(args: string[]): Promise<number> {
  const { flags } = parseArgs(args);
  const useJson = shouldUseJsonOutput(flags);
  if (flags.has("help")) {
    console.log(logoutHelp());
    return 0;
  }

  await clearStoredAuthConfig();
  const payload = okResponse("auth-logout.v1", {
    cleared: true,
    userSettingsPath: resolveAuthConfigPath(),
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
