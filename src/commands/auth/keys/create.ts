import { getStringFlag, hasFlag, parseArgs, shouldUseJsonOutput } from "../../../util/args.js";
import { renderCommandHelp } from "../../../util/command-metadata.js";
import { printJson } from "../../../util/io.js";
import { assertUserId } from "../../../util/public-ids.js";
import { okResponse } from "../../../util/response.js";
import { requireAuthApiClient } from "./shared.js";
import { authKeysCreateCommand } from "../metadata.js";

export async function runAuthKeysCreate(args: string[]): Promise<number> {
  const { flags } = parseArgs(args);
  const useJson = shouldUseJsonOutput(flags);
  const dryRun = hasFlag(flags, "dry-run");
  if (flags.has("help")) {
    console.log(renderCommandHelp(authKeysCreateCommand));
    return 0;
  }

  const label = getStringFlag(flags, "label");
  if (!label) {
    throw new Error("Missing required flag: --label");
  }

  const userIdFlag = getStringFlag(flags, "user-id");
  const userId = userIdFlag ? assertUserId(userIdFlag) : undefined;
  const expiresAt = getStringFlag(flags, "expires-at") ?? undefined;
  const { auth, client } = await requireAuthApiClient(flags);
  if (dryRun) {
    const me = await client.me();
    const targetUserId = userId ?? me.user.id;
    const preview = {
      targetState: targetUserId === me.user.id ? "self" : "managed-user",
      changeState: "would_change",
      reason: "key_would_be_created",
    };
    const payload = okResponse("auth-keys-create.v1", {
      dryRun: true,
      wouldChange: true,
      preview,
      baseUrl: auth.baseUrl,
      source: auth.source,
      apiKey: null,
      rawKey: null,
      targetUserId,
      label,
      expiresAt: expiresAt ?? null,
    }, {
      command: "fide keys create",
      next: {
        list: "fide keys list",
      },
    });

    if (useJson) {
      printJson(payload);
    } else {
      console.log(`Dry run: create key for ${targetUserId ?? "current user"} ${preview.reason}`);
    }
    return 0;
  }

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
