import { getStringFlag, hasFlag, parseArgs, shouldUseJsonOutput } from "../../../util/args.js";
import { renderCommandHelp } from "../../../util/command-metadata.js";
import { printJson } from "../../../util/io.js";
import { assertAccountId } from "../../../util/public-ids.js";
import { formatPretty } from "../../../util/pretty.js";
import { okResponse } from "../../../util/response.js";
import { assertRoleKey } from "../../../util/selectors.js";
import { workspaceRolesGrantCommand } from "../metadata.js";
import { requireHostedWorkspaceTarget, requireWorkspaceApiClient, runHostedOperation } from "../shared.js";

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
    const alreadyHasRole = Boolean(existing?.roles.includes(roleKey));
    const preview = !existing
      ? {
        targetState: "missing-member",
        changeState: "blocked",
        reason: "member_missing",
      }
      : alreadyHasRole
        ? {
          targetState: "existing-member",
          changeState: "unchanged",
          reason: "role_already_present",
        }
        : {
          targetState: "existing-member",
          changeState: "would_change",
          reason: "role_missing",
        };
    const wouldChange = preview.changeState === "would_change";
    const payload = okResponse("workspace-roles-grant.v1", {
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
      command: "fide workspace roles grant",
      next: {
        members: `fide workspace members list --workspace ${workspaceId}`,
      },
    });

    if (useJson) {
      printJson(payload);
    } else {
      console.log(formatPretty("workspace-roles-grant.v1", payload));
    }
    return 0;
  }

  const result = await runHostedOperation(
    () => client.grantWorkspaceRole({ workspaceId, accountId, roleKey }),
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
  const payload = okResponse("workspace-roles-grant.v1", {
    baseUrl: auth.baseUrl,
    source: auth.source,
    ...result,
  }, {
    command: "fide workspace roles grant",
    next: {
      members: `fide workspace members list --workspace ${workspaceId}`,
      revoke: `fide workspace roles revoke --workspace ${workspaceId} --account-id ${accountId} --role ${roleKey}`,
    },
  });

  if (useJson) {
    printJson(payload);
  } else {
    console.log(formatPretty("workspace-roles-grant.v1", payload));
  }
  return 0;
}
