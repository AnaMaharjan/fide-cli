import { getStringFlag, parseArgs, shouldUseJsonOutput } from "../../../util/args.js";
import { renderCommandHelp } from "../../../util/command-metadata.js";
import { printJson } from "../../../util/io.js";
import { formatPretty } from "../../../util/pretty.js";
import { okResponse } from "../../../util/response.js";
import { getWorkspaceFlag } from "../../../util/workspace-settings.js";
import { workspaceMembersCommand } from "../metadata.js";
import { requireWorkspaceApiClient } from "../shared.js";

export async function runWorkspaceMembers(args: string[]): Promise<number> {
  const { flags } = parseArgs(args);
  const useJson = shouldUseJsonOutput(flags);
  if (flags.has("help")) {
    console.log(renderCommandHelp(workspaceMembersCommand));
    return 0;
  }

  const id = getWorkspaceFlag(flags);
  if (!id) {
    throw new Error("Missing required flag: --workspace");
  }

  const { auth, client } = await requireWorkspaceApiClient();
  const result = await client.listWorkspaceMembers(id);
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
