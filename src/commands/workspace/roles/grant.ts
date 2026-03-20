import { getStringFlag, parseArgs, shouldUseJsonOutput } from "../../../util/args.js";
import { renderHelp } from "../../../util/help.js";
import { printJson } from "../../../util/io.js";
import { okResponse } from "../../../util/response.js";
import { requireWorkspaceApiClient } from "../shared.js";

function rolesGrantHelp(): string {
  return renderHelp({
    sections: [
      {
        title: "Usage",
        items: [
          "  fide workspace roles grant --workspace-id <workspace-id> --user-id <user-id> --role <role-code> [--pretty|-p]",
        ],
      },
    ],
  });
}

export async function runWorkspaceRolesGrant(args: string[]): Promise<number> {
  const { flags } = parseArgs(args);
  const useJson = shouldUseJsonOutput(flags);
  if (flags.has("help")) {
    console.log(rolesGrantHelp());
    return 0;
  }

  const workspaceId = getStringFlag(flags, "workspace-id");
  const userId = getStringFlag(flags, "user-id");
  const roleCode = getStringFlag(flags, "role");
  if (!workspaceId) throw new Error("Missing required flag: --workspace-id");
  if (!userId) throw new Error("Missing required flag: --user-id");
  if (!roleCode) throw new Error("Missing required flag: --role");

  const { auth, client } = await requireWorkspaceApiClient();
  const result = await client.grantWorkspaceRole({ workspaceId, userId, roleCode });
  const payload = okResponse("workspace-roles-grant.v1", {
    baseUrl: auth.baseUrl,
    source: auth.source,
    ...result,
  }, {
    command: "fide workspace roles grant",
    next: {
      members: `fide workspace members --id ${workspaceId}`,
      revoke: `fide workspace roles revoke --workspace-id ${workspaceId} --user-id ${userId} --role ${roleCode}`,
    },
  });

  if (useJson) {
    printJson(payload);
  } else {
    console.log(`Granted ${roleCode} to ${userId} in ${workspaceId}`);
  }
  return 0;
}
