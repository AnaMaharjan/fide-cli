import { parseArgs, shouldUseJsonOutput } from "../../util/args.js";
import { renderHelp } from "../../util/help.js";
import { printJson } from "../../util/io.js";
import { okResponse } from "../../util/response.js";
import { requireWorkspaceApiClient } from "./shared.js";

function listHelp(): string {
  return renderHelp({
    sections: [
      {
        title: "Usage",
        items: [
          "  fide workspace list [--pretty|-p]",
        ],
      },
    ],
  });
}

export async function runWorkspaceList(args: string[]): Promise<number> {
  const { flags } = parseArgs(args);
  const useJson = shouldUseJsonOutput(flags);
  if (flags.has("help")) {
    console.log(listHelp());
    return 0;
  }

  const { auth, client } = await requireWorkspaceApiClient();
  const result = await client.listWorkspaces();
  const payload = okResponse("workspace-list.v1", {
    baseUrl: auth.baseUrl,
    source: auth.source,
    workspaces: result.workspaces,
  }, {
    command: "fide workspace list",
    next: result.workspaces[0]
      ? {
          get: `fide workspace get --workspace ${result.workspaces[0].id}`,
          members: `fide workspace members --workspace ${result.workspaces[0].id}`,
        }
      : undefined,
  });

  if (useJson) {
    printJson(payload);
  } else {
    for (const workspace of result.workspaces) {
      console.log(`${workspace.id} ${workspace.slug} ${workspace.name}`);
    }
    if (result.workspaces[0]) {
      console.log("");
      console.log(`Next: fide workspace members --workspace ${result.workspaces[0].id}`);
    }
  }
  return 0;
}
