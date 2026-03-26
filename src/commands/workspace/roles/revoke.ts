import { getStringFlag, hasFlag, parseArgs, shouldUseJsonOutput } from "../../../util/command/args.js";
import { renderCommandHelp } from "../../../util/command/command-metadata.js";
import { printJson } from "../../../util/command/io.js";
import { assertAccountId } from "../../../util/ids/public-ids.js";
import { formatPretty } from "../../../util/command/pretty.js";
import { okResponse } from "../../../util/command/response.js";
import { assertRoleKey } from "../../../util/ids/selectors.js";
import { workspaceRolesRevokeCommand } from "../metadata.js";
import { requireHostedWorkspaceTarget, requireWorkspaceApiClient, runHostedOperation } from "../shared.js";

export async function runWorkspaceRolesRevoke(args: string[]): Promise<number> {
  const { flags } = parseArgs(args);
  const useJson = shouldUseJsonOutput(flags);
  const dryRun = hasFlag(flags, "dry-run");
  if (flags.has("help")) {
    console.log(renderCommandHelp(workspaceRolesRevokeCommand));
    return 0;
  }

  const selection = await requireHostedWorkspaceTarget(flags);
  const workspaceId = selection.workspaceId;
  const accountIdFlag = getStringFlag(flags, "account-id");
  const roleFlag = getStringFlag(flags, "role");
  if (!accountIdFlag) throw new Error("Missing required flag: --account-id");
  if (!roleFlag) throw new Error("Missing required flag: --role");
  const accountId = assertAccountId(accountIdFlag);
  const roleKey = assertRoleKey(roleFlag);

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
        accountId,
        roleKey,
      },
    );
    const existing = members.members.find((member) => member.accountId === accountId);
    const hasRole = Boolean(existing?.roles.includes(roleKey));
    const preview = !existing
      ? {
        targetState: "missing-member",
        changeState: "blocked",
        reason: "member_missing",
      }
      : hasRole
        ? {
          targetState: "existing-member",
          changeState: "would_change",
          reason: "role_present",
        }
        : {
          targetState: "existing-member",
          changeState: "unchanged",
          reason: "role_not_present",
        };
    const wouldChange = preview.changeState === "would_change";
    const payload = okResponse("workspace-roles-revoke.v1", {
      dryRun: true,
      wouldChange,
      preview,
      baseUrl: auth.baseUrl,
      source: auth.source,
      ok: true,
      workspaceId,
      accountId,
      roleKey,
    }, {
      command: "fide workspace roles revoke",
      next: {
        members: `fide workspace members list --workspace ${workspaceId}`,
      },
    });

    if (useJson) {
      printJson(payload);
    } else {
      console.log(formatPretty("workspace-roles-revoke.v1", payload));
    }
    return 0;
  }

  const result = await runHostedOperation(
    () => client.revokeWorkspaceRole({ workspaceId, accountId, roleKey }),
    {
      auth,
      client,
      targetScope: "workspace",
      workspaceId,
      workspaceSelectionSource: selection.source,
      accountId,
      roleKey,
    },
  );
  const payload = okResponse("workspace-roles-revoke.v1", {
    baseUrl: auth.baseUrl,
    source: auth.source,
    ...result,
  }, {
    command: "fide workspace roles revoke",
    next: {
      members: `fide workspace members list --workspace ${workspaceId}`,
    },
  });

  if (useJson) {
    printJson(payload);
  } else {
    console.log(formatPretty("workspace-roles-revoke.v1", payload));
  }
  return 0;
}
