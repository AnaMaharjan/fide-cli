import { parseArgs, shouldUseJsonOutput } from "../../../util/args.js";
import { renderCommandHelp } from "../../../util/command-metadata.js";
import { printJson } from "../../../util/io.js";
import { okResponse } from "../../../util/response.js";
import { resolveWorkspaceSelectionOrThrow } from "../../../util/workspace-settings.js";
import { workspaceSettingsGetCommand } from "../metadata.js";
import { requireWorkspaceApiClient } from "../shared.js";

export async function runWorkspaceSettingsGet(args: string[]): Promise<number> {
  const { flags } = parseArgs(args);
  const useJson = shouldUseJsonOutput(flags);
  if (flags.has("help")) {
    console.log(renderCommandHelp(workspaceSettingsGetCommand));
    return 0;
  }

  const selection = await resolveWorkspaceSelectionOrThrow(flags);
  const { auth, client } = await requireWorkspaceApiClient();
  const settings = await client.getWorkspaceSettings(selection.workspaceId);
  const payload = okResponse("workspace-settings-get.v1", {
    baseUrl: auth.baseUrl,
    source: auth.source,
    workspaceId: selection.workspaceId,
    workspaceSelectionSource: selection.source,
    settings: settings.settings,
  }, {
    command: "fide workspace settings get",
  });

  if (useJson) {
    printJson(payload);
  } else {
    console.log(JSON.stringify(payload.settings, null, 2));
  }
  return 0;
}
