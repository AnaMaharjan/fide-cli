import { getStringFlag, parseArgs, shouldUseJsonOutput } from "../../../util/args.js";
import { renderHelp } from "../../../util/help.js";
import { printJson } from "../../../util/io.js";
import { okResponse } from "../../../util/response.js";
import { getWorkspaceFlag } from "../../../util/workspace-settings.js";
import { requireWorkspaceApiClient } from "../shared.js";

function rolesRevokeHelp(): string {
  return renderHelp({
    sections: [
      {
        title: "Usage",
        items: [
          "  fide workspace roles revoke --workspace <workspace-id> --user-id <user-id> --role <role-code> [--pretty|-p]",
        ],
      },
    ],
  });
}

export async function runWorkspaceRolesRevoke(args: string[]): Promise<number> {
  const { flags } = parseArgs(args);
  const useJson = shouldUseJsonOutput(flags);
  if (flags.has("help")) {
    console.log(rolesRevokeHelp());
    return 0;
  }

  const workspaceId = getWorkspaceFlag(flags);
  const userId = getStringFlag(flags, "user-id");
  const roleCode = getStringFlag(flags, "role");
  if (!workspaceId) throw new Error("Missing required flag: --workspace");
  if (!userId) throw new Error("Missing required flag: --user-id");
  if (!roleCode) throw new Error("Missing required flag: --role");

  const { auth, client } = await requireWorkspaceApiClient();
  const result = await client.revokeWorkspaceRole({ workspaceId, userId, roleCode });
  const payload = okResponse("workspace-roles-revoke.v1", {
    baseUrl: auth.baseUrl,
    source: auth.source,
    ...result,
  }, {
    command: "fide workspace roles revoke",
    next: {
      members: `fide workspace members --workspace ${workspaceId}`,
    },
  });

  if (useJson) {
    printJson(payload);
  } else {
    console.log(`Revoked ${roleCode} from ${userId} in ${workspaceId}`);
  }
  return 0;
}
