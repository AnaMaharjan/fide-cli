import { getStringFlag, hasFlag, parseArgs, shouldUseJsonOutput } from "../../../util/args.js";
import { renderCommandHelp } from "../../../util/command-metadata.js";
import { printJson } from "../../../util/io.js";
import { okResponse } from "../../../util/response.js";
import { workspaceMembersAddCommand } from "../metadata.js";
import { requireHostedWorkspaceTarget, requireWorkspaceApiClient } from "../shared.js";

export async function runWorkspaceMembersAdd(args: string[]): Promise<number> {
  const { flags } = parseArgs(args);
  const useJson = shouldUseJsonOutput(flags);
  const dryRun = hasFlag(flags, "dry-run");
  if (flags.has("help")) {
    console.log(renderCommandHelp(workspaceMembersAddCommand));
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
    const payload = okResponse("workspace-members-add.v1", {
      dryRun: true,
      wouldChange,
      baseUrl: auth.baseUrl,
      source: auth.source,
      ok: true,
      workspaceId,
      userId,
      roleCode,
    }, {
      command: "fide workspace members add",
      next: {
        members: `fide workspace members list --workspace ${workspaceId}`,
      },
    });

    if (useJson) {
      printJson(payload);
    } else {
      console.log(`Dry run: add ${userId} to ${workspaceId} with ${roleCode} ${wouldChange ? "would change" : "unchanged"}`);
    }
    return 0;
  }

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
