import { getStringFlag, hasFlag, parseArgs, shouldUseJsonOutput } from "../../../util/args.js";
import { renderCommandHelp } from "../../../util/command-metadata.js";
import { printJson } from "../../../util/io.js";
import { okResponse } from "../../../util/response.js";
import { workspaceRolesGrantCommand } from "../metadata.js";
import { requireHostedWorkspaceTarget, requireWorkspaceApiClient } from "../shared.js";

export async function runWorkspaceRolesGrant(args: string[]): Promise<number> {
  const { flags } = parseArgs(args);
  const useJson = shouldUseJsonOutput(flags);
  const dryRun = hasFlag(flags, "dry-run");
  if (flags.has("help")) {
    console.log(renderCommandHelp(workspaceRolesGrantCommand));
    return 0;
  }

  const selection = await requireHostedWorkspaceTarget(flags);
  const workspaceId = selection.workspaceId;
  const userId = getStringFlag(flags, "user-id");
  const roleCode = getStringFlag(flags, "role");
  if (!userId) throw new Error("Missing required flag: --user-id");
  if (!roleCode) throw new Error("Missing required flag: --role");

  const { auth, client } = await requireWorkspaceApiClient(flags);
  if (dryRun) {
    const members = await client.listWorkspaceMembers(workspaceId);
    const existing = members.members.find((member) => member.userId === userId);
    const alreadyHasRole = Boolean(existing?.roles.includes(roleCode));
    const wouldChange = !alreadyHasRole;
    const payload = okResponse("workspace-roles-grant.v1", {
      dryRun: true,
      wouldChange,
      baseUrl: auth.baseUrl,
      source: auth.source,
      ok: true,
      workspaceId,
      userId,
      roleCode,
    }, {
      command: "fide workspace roles grant",
      next: {
        members: `fide workspace members list --workspace ${workspaceId}`,
      },
    });

    if (useJson) {
      printJson(payload);
    } else {
      console.log(`Dry run: grant ${roleCode} to ${userId} in ${workspaceId} ${wouldChange ? "would change" : "unchanged"}`);
    }
    return 0;
  }

  const result = await client.grantWorkspaceRole({ workspaceId, userId, roleCode });
  const payload = okResponse("workspace-roles-grant.v1", {
    baseUrl: auth.baseUrl,
    source: auth.source,
    ...result,
  }, {
    command: "fide workspace roles grant",
    next: {
      members: `fide workspace members list --workspace ${workspaceId}`,
      revoke: `fide workspace roles revoke --workspace ${workspaceId} --user-id ${userId} --role ${roleCode}`,
    },
  });

  if (useJson) {
    printJson(payload);
  } else {
    console.log(`Granted ${roleCode} to ${userId} in ${workspaceId}`);
  }
  return 0;
}
