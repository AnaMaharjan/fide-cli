import { getStringFlag, parseArgs, shouldUseJsonOutput } from "../../../util/args.js";
import { renderCommandHelp } from "../../../util/command-metadata.js";
import { printJson } from "../../../util/io.js";
import { okResponse } from "../../../util/response.js";
import { getWorkspaceFlag } from "../../../util/workspace-settings.js";
import { workspaceServiceAccountCreateCommand } from "../metadata.js";
import { requireWorkspaceApiClient } from "../shared.js";

export async function runWorkspaceServiceAccountCreate(args: string[]): Promise<number> {
  const { flags } = parseArgs(args);
  const useJson = shouldUseJsonOutput(flags);
  if (flags.has("help")) {
    console.log(renderCommandHelp(workspaceServiceAccountCreateCommand));
    return 0;
  }

  const workspaceId = getWorkspaceFlag(flags);
  const label = getStringFlag(flags, "label");
  const roleCode = getStringFlag(flags, "role");
  if (!workspaceId) {
    throw new Error("Missing required flag: --workspace");
  }
  if (!label) {
    throw new Error("Missing required flag: --label");
  }
  if (!roleCode) {
    throw new Error("Missing required flag: --role");
  }

  const { auth, client } = await requireWorkspaceApiClient();
  const serviceAccount = await client.createServiceAccount({
    workspaceId,
    label,
    roleCode,
  });

  const payload = okResponse("workspace-service-account-create.v1", {
    baseUrl: auth.baseUrl,
    source: auth.source,
    serviceAccount,
  }, {
    command: "fide workspace service-accounts create",
    next: {
      apiKeyCreate: `fide auth keys create --label '${label}' --user-id ${serviceAccount.userId}`,
      members: `fide workspace members list --workspace ${workspaceId}`,
    },
  });

  if (useJson) {
    printJson(payload);
  } else {
    console.log(`${serviceAccount.userId} ${serviceAccount.email}`);
  }
  return 0;
}
