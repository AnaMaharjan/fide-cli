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
import { createAuthApiClient } from "../../util/auth/auth-api.js";
import { resolveAuthSettings } from "../../util/auth/auth-settings.js";
export const authWhoamiCommand = defineCommand({
  surface: "whoami",
  command: "fide whoami",
  outputType: "AuthWhoamiOutput",
  summary: "Resolve the current authenticated user through the API",
  usage: ["fide whoami [--pretty|-p]"],
  paramOrder: ["pretty"],
  params: {
    pretty: { kind: "boolean", shorthand: "-p", description: "Human-readable output" },
  },
});

const WHOAMI_PARSE_KEYS = mergeBooleanKeySets(booleanKeysFromCommand(authWhoamiCommand));

export type AuthWhoamiOutput = {
  ok: true;
  scope: "auth-whoami.v1";
  command: "fide whoami";
  baseUrl: string;
  source: string;
  user: Record<string, unknown>;
};

export async function runAuthWhoami(args: string[]): Promise<number> {
  const { flags } = parseArgs(args, { booleanKeys: WHOAMI_PARSE_KEYS });
  const useJson = shouldUseJsonOutput(flags);
  if (flags.has("help")) {
    console.log(renderCommandHelp(authWhoamiCommand));
    return 0;
  }

  const auth = await resolveAuthSettings(flags);
  if (!auth) {
    throw new Error("No Fide auth account resolved. Set FIDE_ACCOUNT_ID, set FIDE_DIR/_meta.json with account.id, or run `fide login`.");
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
