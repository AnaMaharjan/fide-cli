import { getStringFlag, hasFlag, parseArgs, shouldUseJsonOutput } from "../../../util/args.js";
import { renderCommandHelp } from "../../../util/command-metadata.js";
import { printJson } from "../../../util/io.js";
import { assertAccountId } from "../../../util/public-ids.js";
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
  const accountIdFlag = getStringFlag(flags, "account-id");
  const email = getStringFlag(flags, "human-email");
  const roleFlag = getStringFlag(flags, "role");
  if (!accountIdFlag && !email) throw new Error("Missing required flag: --account-id or --human-email");
  if (accountIdFlag && email) throw new Error("Pass only one of --account-id or --human-email");
  if (!roleFlag) throw new Error("Missing required flag: --role");
  const accountId = accountIdFlag ? assertAccountId(accountIdFlag) : null;
  const roleKey = assertRoleKey(roleFlag);
  const target = accountId ?? email!;

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
        accountId: accountId ?? undefined,
        roleKey,
        email: email ?? undefined,
      },
    );
    const existing = accountId
      ? members.members.find((member) => member.accountId === accountId)
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
      accountId,
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
      ...(accountId ? { accountId } : {}),
      ...(email ? { email } : {}),
      roleKey,
    }),
    {
      auth,
      client,
      targetScope: "workspace",
      workspaceId,
      workspaceSelectionSource: selection.source,
      accountId: accountId ?? undefined,
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
      ...(accountId ? { grantRole: `fide workspace roles grant --workspace ${workspaceId} --account-id ${accountId} --role <role-key>` } : {}),
    },
  });

  if (useJson) {
    printJson(payload);
  } else {
    console.log(formatPretty("workspace-members-add.v1", payload));
  }
  return 0;
}
