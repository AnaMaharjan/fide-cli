import { parseArgs, shouldUseJsonOutput } from "../../../util/args.js";
import { renderCommandHelp } from "../../../util/command-metadata.js";
import { printJson } from "../../../util/io.js";
import { okResponse } from "../../../util/response.js";
import { requireAuthApiClient } from "./shared.js";
import { authKeysRevokeCommand } from "../metadata.js";

export async function runAuthKeysRevoke(args: string[]): Promise<number> {
  const { positionals, flags } = parseArgs(args);
  const useJson = shouldUseJsonOutput(flags);
  if (flags.has("help")) {
    console.log(renderCommandHelp(authKeysRevokeCommand));
    return 0;
  }

  const id = positionals[0];
  if (!id) {
    throw new Error("Missing required API key id");
  }

  const { auth, client } = await requireAuthApiClient();
  const result = await client.revokeApiKey(id);
  const payload = okResponse("auth-keys-revoke.v1", {
    baseUrl: auth.baseUrl,
    source: auth.source,
    id,
    ...result,
  }, {
    command: "fide auth keys revoke",
  });

  if (useJson) {
    printJson(payload);
  } else {
    console.log(`Revoked ${id}`);
  }
  return 0;
}
