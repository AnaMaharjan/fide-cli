import { getStringFlag, parseArgs, shouldUseJsonOutput } from "../../util/command/args.js";
import { renderCommandHelp } from "../../util/command/command-metadata.js";
import { printJson } from "../../util/command/io.js";
import { formatPretty } from "../../util/command/pretty.js";
import { okResponse } from "../../util/command/response.js";
import { workspaceGetCommand } from "./metadata.js";
import { requireHostedWorkspaceTarget, requireWorkspaceApiClient, runHostedOperation } from "./shared.js";

export async function runWorkspaceGet(args: string[]): Promise<number> {
  const { flags } = parseArgs(args);
  const useJson = shouldUseJsonOutput(flags);
  if (flags.has("help")) {
    console.log(renderCommandHelp(workspaceGetCommand));
    return 0;
  }

  const selection = await requireHostedWorkspaceTarget(flags);
  const id = selection.workspaceId;

  const { auth, client } = await requireWorkspaceApiClient(flags);
  const workspace = await runHostedOperation(
    () => client.getWorkspace(id),
    {
      auth,
      client,
      targetScope: "workspace",
      workspaceId: id,
      workspaceSelectionSource: selection.source,
    },
  );
  const payload = okResponse("workspace-get.v1", {
    baseUrl: auth.baseUrl,
    source: auth.source,
    workspace,
  });

  if (useJson) {
    printJson(payload);
  } else {
    console.log(formatPretty("workspace-get.v1", payload) ?? JSON.stringify(payload, null, 2));
  }
  return 0;
}
