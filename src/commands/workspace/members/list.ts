import { getStringFlag, parseArgs, shouldUseJsonOutput } from "../../../util/args.js";
import { renderCommandHelp } from "../../../util/command-metadata.js";
import { printJson } from "../../../util/io.js";
import { formatPretty } from "../../../util/pretty.js";
import { okResponse } from "../../../util/response.js";
import { workspaceMembersCommand } from "../metadata.js";
import { requireHostedWorkspaceTarget, requireWorkspaceApiClient, runHostedOperation } from "../shared.js";

export async function runWorkspaceMembers(args: string[]): Promise<number> {
  const { flags } = parseArgs(args);
  const useJson = shouldUseJsonOutput(flags);
  if (flags.has("help")) {
    console.log(renderCommandHelp(workspaceMembersCommand));
    return 0;
  }

  const selection = await requireHostedWorkspaceTarget(flags);
  const id = selection.workspaceId;

  const { auth, client } = await requireWorkspaceApiClient(flags);
  const result = await runHostedOperation(
    () => client.listWorkspaceMembers(id),
    {
      auth,
      client,
      targetScope: "workspace",
      workspaceId: id,
      workspaceSelectionSource: selection.source,
    },
  );
  const payload = okResponse("workspace-members.v1", {
    baseUrl: auth.baseUrl,
    source: auth.source,
    workspaceId: id,
    members: result.members,
  }, {
    command: "fide workspace members list",
  });

  if (useJson) {
    printJson(payload);
  } else {
    console.log(formatPretty("workspace-members.v1", payload) ?? JSON.stringify(payload, null, 2));
  }
  return 0;
}
