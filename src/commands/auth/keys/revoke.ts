import { hasFlag, parseArgs, shouldUseJsonOutput } from "../../../util/args.js";
import { renderCommandHelp } from "../../../util/command-metadata.js";
import { printJson } from "../../../util/io.js";
import { assertApiKeyId } from "../../../util/public-ids.js";
import { okResponse } from "../../../util/response.js";
import { requireAuthApiClient } from "./shared.js";
import { authKeysRevokeCommand } from "../metadata.js";

export async function runAuthKeysRevoke(args: string[]): Promise<number> {
  const { positionals, flags } = parseArgs(args);
  const useJson = shouldUseJsonOutput(flags);
  const dryRun = hasFlag(flags, "dry-run");
  if (flags.has("help")) {
    console.log(renderCommandHelp(authKeysRevokeCommand));
    return 0;
  }

  const id = positionals[0];
  if (!id) {
    throw new Error("Missing required API key id");
  }
  const apiKeyId = assertApiKeyId(id);

  const { auth, client } = await requireAuthApiClient(flags);
  if (dryRun) {
    const listed = await client.listApiKeys();
    const existing = listed.apiKeys.find((apiKey) => apiKey.id === apiKeyId) ?? null;
    const preview = existing
      ? {
        targetState: "existing-key",
        changeState: "would_change",
        reason: "key_present",
      }
      : {
        targetState: "missing-key",
        changeState: "blocked",
        reason: "key_not_visible",
      };
    const payload = okResponse("auth-keys-revoke.v1", {
      dryRun: true,
      wouldChange: preview.changeState === "would_change",
      preview,
      baseUrl: auth.baseUrl,
      source: auth.source,
      id: apiKeyId,
      ok: true,
    }, {
      command: "fide keys revoke",
      next: {
        list: "fide keys list",
      },
    });

    if (useJson) {
      printJson(payload);
    } else {
      console.log(`Dry run: revoke ${apiKeyId} ${preview.reason}`);
    }
    return 0;
  }

  const result = await client.revokeApiKey(apiKeyId);
  const payload = okResponse("auth-keys-revoke.v1", {
    baseUrl: auth.baseUrl,
    source: auth.source,
    id: apiKeyId,
    ...result,
  }, {
    command: "fide keys revoke",
  });

  if (useJson) {
    printJson(payload);
  } else {
    console.log(`Revoked ${apiKeyId}`);
  }
  return 0;
}
