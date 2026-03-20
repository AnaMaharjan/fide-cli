import { parseArgs, shouldUseJsonOutput } from "../../../util/args.js";
import { renderHelp } from "../../../util/help.js";
import { printJson } from "../../../util/io.js";
import { okResponse } from "../../../util/response.js";
import { resolveWorkspaceSelectionOrThrow } from "../../../util/workspace-settings.js";
import { requireWorkspaceApiClient } from "../shared.js";

function settingsGetHelp(): string {
  return renderHelp({
    sections: [
      {
        title: "Usage",
        items: [
          "  fide workspace settings get [--workspace <workspace-id>] [--pretty|-p]",
        ],
      },
    ],
  });
}

export async function runWorkspaceSettingsGet(args: string[]): Promise<number> {
  const { flags } = parseArgs(args);
  const useJson = shouldUseJsonOutput(flags);
  if (flags.has("help")) {
    console.log(settingsGetHelp());
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
