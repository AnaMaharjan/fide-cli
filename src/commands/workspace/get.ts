import { getStringFlag, parseArgs, shouldUseJsonOutput } from "../../util/args.js";
import { renderCommandHelp } from "../../util/command-metadata.js";
import { printJson } from "../../util/io.js";
import { formatPretty } from "../../util/pretty.js";
import { okResponse } from "../../util/response.js";
import { getWorkspaceFlag } from "../../util/workspace-settings.js";
import { workspaceGetCommand } from "./metadata.js";
import { requireWorkspaceApiClient } from "./shared.js";

export async function runWorkspaceGet(args: string[]): Promise<number> {
  const { flags } = parseArgs(args);
  const useJson = shouldUseJsonOutput(flags);
  if (flags.has("help")) {
    console.log(renderCommandHelp(workspaceGetCommand));
    return 0;
  }

  const id = getWorkspaceFlag(flags);
  if (!id) {
    throw new Error("Missing required flag: --workspace");
  }

  const { auth, client } = await requireWorkspaceApiClient();
  const workspace = await client.getWorkspace(id);
  const payload = okResponse("workspace-get.v1", {
    baseUrl: auth.baseUrl,
    source: auth.source,
    workspace,
  }, {
    command: "fide workspace get",
    next: {
      members: `fide workspace members list --workspace ${workspace.id}`,
    },
  });

  if (useJson) {
    printJson(payload);
  } else {
    console.log(formatPretty("workspace-get.v1", payload) ?? JSON.stringify(payload, null, 2));
  }
  return 0;
}
