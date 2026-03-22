import { getStringFlag, parseArgs, shouldUseJsonOutput } from "../../../util/args.js";
import { renderCommandHelp } from "../../../util/command-metadata.js";
import { printJson } from "../../../util/io.js";
import { okResponse } from "../../../util/response.js";
import { requireAuthApiClient } from "./shared.js";
import { authKeysCreateCommand } from "../metadata.js";

export async function runAuthKeysCreate(args: string[]): Promise<number> {
  const { flags } = parseArgs(args);
  const useJson = shouldUseJsonOutput(flags);
  if (flags.has("help")) {
    console.log(renderCommandHelp(authKeysCreateCommand));
    return 0;
  }

  const label = getStringFlag(flags, "label");
  if (!label) {
    throw new Error("Missing required flag: --label");
  }

  const userId = getStringFlag(flags, "user-id") ?? undefined;
  const expiresAt = getStringFlag(flags, "expires-at") ?? undefined;
  const { auth, client } = await requireAuthApiClient(flags);
  const created = await client.createApiKey({
    label,
    ...(userId ? { userId } : {}),
    ...(expiresAt ? { expiresAt } : {}),
  });

  const payload = okResponse("auth-keys-create.v1", {
    baseUrl: auth.baseUrl,
    source: auth.source,
    apiKey: created.apiKey,
    rawKey: created.rawKey,
  }, {
    command: "fide keys create",
  });

  if (useJson) {
    printJson(payload);
  } else {
    console.log(created.rawKey);
  }
  return 0;
}
