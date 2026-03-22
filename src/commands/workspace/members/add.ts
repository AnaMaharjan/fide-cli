import { getStringFlag, parseArgs, shouldUseJsonOutput } from "../../../util/args.js";
import { renderCommandHelp } from "../../../util/command-metadata.js";
import { printJson } from "../../../util/io.js";
import { okResponse } from "../../../util/response.js";
import { getWorkspaceFlag } from "../../../util/workspace-settings.js";
import { workspaceMembersAddCommand } from "../metadata.js";
import { requireWorkspaceApiClient } from "../shared.js";

export async function runWorkspaceMembersAdd(args: string[]): Promise<number> {
  const { flags } = parseArgs(args);
  const useJson = shouldUseJsonOutput(flags);
  if (flags.has("help")) {
    console.log(renderCommandHelp(workspaceMembersAddCommand));
    return 0;
  }

  const workspaceId = getWorkspaceFlag(flags);
  const userId = getStringFlag(flags, "user-id");
  const roleCode = getStringFlag(flags, "role");
  if (!workspaceId) throw new Error("Missing required flag: --workspace");
  if (!userId) throw new Error("Missing required flag: --user-id");
  if (!roleCode) throw new Error("Missing required flag: --role");

  const { auth, client } = await requireWorkspaceApiClient(flags);
  const result = await client.addWorkspaceMember({ workspaceId, userId, roleCode });
  const payload = okResponse("workspace-members-add.v1", {
    baseUrl: auth.baseUrl,
    source: auth.source,
    ...result,
  }, {
    command: "fide workspace members add",
    next: {
      members: `fide workspace members list --workspace ${workspaceId}`,
      grantRole: `fide workspace roles grant --workspace ${workspaceId} --user-id ${userId} --role <role-code>`,
    },
  });

  if (useJson) {
    printJson(payload);
  } else {
    console.log(`Added ${userId} to ${workspaceId} with ${roleCode}`);
  }
  return 0;
}
