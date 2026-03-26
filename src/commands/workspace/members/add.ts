import { getStringFlag, hasFlag, parseArgs, shouldUseJsonOutput } from "../../../util/args.js";
import { renderCommandHelp } from "../../../util/command-metadata.js";
import { printJson } from "../../../util/io.js";
import { assertUserId } from "../../../util/public-ids.js";
import { formatPretty } from "../../../util/pretty.js";
import { okResponse } from "../../../util/response.js";
import { assertRoleKey } from "../../../util/selectors.js";
import { workspaceMembersAddCommand } from "../metadata.js";
import { requireHostedWorkspaceTarget, requireWorkspaceApiClient, runHostedOperation } from "../shared.js";

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
  const userIdFlag = getStringFlag(flags, "user-id");
  const email = getStringFlag(flags, "human-email");
  const roleFlag = getStringFlag(flags, "role");
  if (!userIdFlag && !email) throw new Error("Missing required flag: --user-id or --human-email");
  if (userIdFlag && email) throw new Error("Pass only one of --user-id or --human-email");
  if (!roleFlag) throw new Error("Missing required flag: --role");
  const userId = userIdFlag ? assertUserId(userIdFlag) : null;
  const roleKey = assertRoleKey(roleFlag);
  const target = userId ?? email!;

  const { auth, client } = await requireWorkspaceApiClient(flags);
  if (dryRun) {
    const members = await runHostedOperation(
      () => client.listWorkspaceMembers(workspaceId),
      {
        auth,
        client,
        targetScope: "workspace",
        workspaceId,
        workspaceSelectionSource: selection.source,
        userId: userId ?? undefined,
        roleKey,
        email: email ?? undefined,
      },
    );
    const existing = userId
      ? members.members.find((member) => member.userId === userId)
      : undefined;
    const alreadyHasRole = Boolean(existing?.roles.includes(roleKey));
    const targetState = email
      ? "email-invite"
      : existing
        ? "existing-member"
        : "missing-member";
    const preview = email
      ? {
        targetState,
        changeState: "would_change",
        reason: "invite_or_add_by_email",
      }
      : existing
        ? alreadyHasRole
          ? {
            targetState,
            changeState: "unchanged",
            reason: "role_already_present",
          }
          : {
            targetState,
            changeState: "would_change",
            reason: "role_missing",
          }
        : {
          targetState,
          changeState: "would_change",
          reason: "member_missing",
        };
    const wouldChange = preview.changeState === "would_change";
    const payload = okResponse("workspace-members-add.v1", {
      dryRun: true,
      wouldChange,
      preview,
      baseUrl: auth.baseUrl,
      source: auth.source,
      ok: true,
      workspaceId,
      userId,
      email: email ?? null,
      roleKey,
    }, {
      command: "fide workspace members add",
      next: {
        members: `fide workspace members list --workspace ${workspaceId}`,
      },
    });

    if (useJson) {
      printJson(payload);
    } else {
      console.log(formatPretty("workspace-members-add.v1", payload));
    }
    return 0;
  }

  const result = await runHostedOperation(
    () => client.addWorkspaceMember({
      workspaceId,
      ...(userId ? { userId } : {}),
      ...(email ? { email } : {}),
      roleKey,
    }),
    {
      auth,
      client,
      targetScope: "workspace",
      workspaceId,
      workspaceSelectionSource: selection.source,
      userId: userId ?? undefined,
      roleKey,
      email: email ?? undefined,
    },
  );
  const payload = okResponse("workspace-members-add.v1", {
    baseUrl: auth.baseUrl,
    source: auth.source,
    ...result,
  }, {
    command: "fide workspace members add",
    next: {
      members: `fide workspace members list --workspace ${workspaceId}`,
      ...(userId ? { grantRole: `fide workspace roles grant --workspace ${workspaceId} --user-id ${userId} --role <role-key>` } : {}),
    },
  });

  if (useJson) {
    printJson(payload);
  } else {
    console.log(formatPretty("workspace-members-add.v1", payload));
  }
  return 0;
}
