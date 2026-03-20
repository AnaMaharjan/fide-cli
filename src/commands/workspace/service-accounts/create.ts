import { getStringFlag, parseArgs, shouldUseJsonOutput } from "../../../util/args.js";
import { renderHelp } from "../../../util/help.js";
import { printJson } from "../../../util/io.js";
import { okResponse } from "../../../util/response.js";
import { getWorkspaceFlag } from "../../../util/workspace-settings.js";
import { requireWorkspaceApiClient } from "../shared.js";

function createHelp(): string {
  return renderHelp({
    sections: [
      {
        title: "Usage",
        items: [
          "  fide workspace service-accounts create --workspace <workspace-id> --label <label> --role <role-code> [--pretty|-p]",
        ],
      },
    ],
  });
}

export async function runWorkspaceServiceAccountCreate(args: string[]): Promise<number> {
  const { flags } = parseArgs(args);
  const useJson = shouldUseJsonOutput(flags);
  if (flags.has("help")) {
    console.log(createHelp());
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
      members: `fide workspace members --workspace ${workspaceId}`,
    },
  });

  if (useJson) {
    printJson(payload);
  } else {
    console.log(`${serviceAccount.userId} ${serviceAccount.email}`);
  }
  return 0;
}
