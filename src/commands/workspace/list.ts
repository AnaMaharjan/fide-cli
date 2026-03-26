import { parseArgs, shouldUseJsonOutput } from "../../util/command/args.js";
import { renderCommandHelp } from "../../util/command/command-metadata.js";
import { printJson } from "../../util/command/io.js";
import { formatPretty } from "../../util/command/pretty.js";
import { okResponse } from "../../util/command/response.js";
import { workspaceListCommand } from "./metadata.js";
import { requireWorkspaceApiClient, runHostedOperation } from "./shared.js";

export async function runWorkspaceList(args: string[]): Promise<number> {
  const { flags } = parseArgs(args);
  const useJson = shouldUseJsonOutput(flags);
  if (flags.has("help")) {
    console.log(renderCommandHelp(workspaceListCommand));
    return 0;
  }

  const { auth, client } = await requireWorkspaceApiClient(flags);
  const result = await runHostedOperation(
    () => client.listWorkspaces(),
    {
      auth,
      client,
    },
  );
  const payload = okResponse("workspace-list.v1", {
    baseUrl: auth.baseUrl,
    source: auth.source,
    workspaces: result.workspaces,
  }, {
    command: "fide workspace list",
    next: result.workspaces[0]
      ? {
          get: `fide workspace get --workspace ${result.workspaces[0].id}`,
          members: `fide workspace members list --workspace ${result.workspaces[0].id}`,
        }
      : undefined,
  });

  if (useJson) {
    printJson(payload);
  } else {
    console.log(formatPretty("workspace-list.v1", payload) ?? JSON.stringify(payload, null, 2));
  }
  return 0;
}
