import { parseArgs, shouldUseJsonOutput } from "../../../util/args.js";
import { printJson } from "../../../util/io.js";
import { okResponse } from "../../../util/response.js";
import { resolveWorkspaceSelectionOrThrow } from "../../../util/workspace-settings.js";
import { requireWorkspaceApiClient } from "../shared.js";

export async function runWorkspaceConnectionsList(args: string[]): Promise<number> {
  const { flags } = parseArgs(args);
  const useJson = shouldUseJsonOutput(flags);

  const selection = await resolveWorkspaceSelectionOrThrow(flags);
  const { auth, client } = await requireWorkspaceApiClient();
  const result = await client.listWorkspaceConnections(selection.workspaceId);

  const payload = okResponse("workspace-connections-list.v1", {
    baseUrl: auth.baseUrl,
    source: auth.source,
    workspaceId: selection.workspaceId,
    workspaceSelectionSource: selection.source,
    connections: result.connections,
  }, {
    command: "fide workspace connections list",
    next: result.connections[0]
      ? {
          settings: `fide workspace settings get --workspace ${selection.workspaceId}`,
        }
      : undefined,
  });

  if (useJson) {
    printJson(payload);
  } else {
    for (const connection of result.connections) {
      console.log(`${connection.id} ${connection.slug} ${connection.kind} ${connection.secretId}`);
    }
  }
  return 0;
}
