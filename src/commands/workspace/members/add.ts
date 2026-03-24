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
  const email = getStringFlag(flags, "human-email");
  const roleCode = getStringFlag(flags, "role");
  if (!userId && !email) throw new Error("Missing required flag: --user-id or --human-email");
  if (userId && email) throw new Error("Pass only one of --user-id or --human-email");
  if (!roleCode) throw new Error("Missing required flag: --role");
  const target = userId ?? email!;

  const { auth, client } = await requireWorkspaceApiClient(flags);
  if (dryRun) {
    const members = await client.listWorkspaceMembers(workspaceId);
    const existing = userId
      ? members.members.find((member) => member.userId === userId)
      : undefined;
    const alreadyHasRole = Boolean(existing?.roles.includes(roleCode));
    const wouldChange = email ? true : !alreadyHasRole;
    const payload = okResponse("workspace-members-add.v1", {
      dryRun: true,
      wouldChange,
      baseUrl: auth.baseUrl,
      source: auth.source,
      ok: true,
      workspaceId,
      userId: userId ?? null,
      email: email ?? null,
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
      console.log(`Dry run: add ${target} to ${workspaceId} with ${roleCode} ${wouldChange ? "would change" : "unchanged"}`);
    }
    return 0;
  }

  const result = await client.addWorkspaceMember({
    workspaceId,
    ...(userId ? { userId } : {}),
    ...(email ? { email } : {}),
    roleCode,
  });
  const payload = okResponse("workspace-members-add.v1", {
    baseUrl: auth.baseUrl,
    source: auth.source,
    ...result,
  }, {
    command: "fide workspace members add",
    next: {
      members: `fide workspace members list --workspace ${workspaceId}`,
      ...(userId ? { grantRole: `fide workspace roles grant --workspace ${workspaceId} --user-id ${userId} --role <role-code>` } : {}),
    },
  });

  if (useJson) {
    printJson(payload);
  } else {
    console.log(`Added ${target} to ${workspaceId} with ${roleCode}`);
  }
  return 0;
}
