import { parseArgs, shouldUseJsonOutput } from "../../../util/args.js";
import { renderHelp } from "../../../util/help.js";
import { printJson } from "../../../util/io.js";
import { okResponse } from "../../../util/response.js";
import { requireAuthApiClient } from "./shared.js";

function revokeHelp(): string {
  return renderHelp({
    sections: [
      {
        title: "Usage",
        items: [
          "  fide auth keys revoke <id> [--pretty|-p]",
        ],
      },
    ],
  });
}

export async function runAuthKeysRevoke(args: string[]): Promise<number> {
  const { positionals, flags } = parseArgs(args);
  const useJson = shouldUseJsonOutput(flags);
  if (flags.has("help")) {
    console.log(revokeHelp());
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
