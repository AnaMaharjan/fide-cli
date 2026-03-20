import { getStringFlag, parseArgs, shouldUseJsonOutput } from "../../util/args.js";
import { renderHelp } from "../../util/help.js";
import { printJson } from "../../util/io.js";
import { okResponse } from "../../util/response.js";
import { getWorkspaceFlag } from "../../util/workspace-settings.js";
import { requireWorkspaceApiClient } from "./shared.js";

function getHelp(): string {
  return renderHelp({
    sections: [
      {
        title: "Usage",
        items: [
          "  fide workspace get --workspace <workspace-id> [--pretty|-p]",
        ],
      },
    ],
  });
}

export async function runWorkspaceGet(args: string[]): Promise<number> {
  const { flags } = parseArgs(args);
  const useJson = shouldUseJsonOutput(flags);
  if (flags.has("help")) {
    console.log(getHelp());
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
      members: `fide workspace members --workspace ${workspace.id}`,
    },
  });

  if (useJson) {
    printJson(payload);
  } else {
    console.log(`${workspace.id} ${workspace.slug} ${workspace.name}`);
  }
  return 0;
}
