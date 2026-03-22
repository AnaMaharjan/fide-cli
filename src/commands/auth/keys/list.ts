import { parseArgs, shouldUseJsonOutput } from "../../../util/args.js";
import { renderCommandHelp } from "../../../util/command-metadata.js";
import { printJson } from "../../../util/io.js";
import { okResponse } from "../../../util/response.js";
import { authKeysListCommand } from "../metadata.js";
import { requireAuthApiClient } from "./shared.js";

export async function runAuthKeysList(args: string[]): Promise<number> {
  const { flags } = parseArgs(args);
  const useJson = shouldUseJsonOutput(flags);
  if (flags.has("help")) {
    console.log(renderCommandHelp(authKeysListCommand));
    return 0;
  }

  const { auth, client } = await requireAuthApiClient(flags);
  const { apiKeys } = await client.listApiKeys();
  const payload = okResponse("auth-keys-list.v1", {
    baseUrl: auth.baseUrl,
    source: auth.source,
    apiKeys,
  }, {
    command: "fide auth keys list",
  });

  if (useJson) {
    printJson(payload);
  } else {
    for (const apiKey of apiKeys) {
      console.log(`${apiKey.id}  ${apiKey.keyPrefix}  ${apiKey.label}`);
    }
  }
  return 0;
}
