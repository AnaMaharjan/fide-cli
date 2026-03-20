import { parseArgs, shouldUseJsonOutput } from "../../../util/args.js";
import { renderHelp } from "../../../util/help.js";
import { printJson, readUtf8 } from "../../../util/io.js";
import { okResponse } from "../../../util/response.js";
import { resolveWorkspaceSelectionOrThrow } from "../../../util/workspace-settings.js";
import { requireWorkspaceApiClient } from "../shared.js";

function settingsSetHelp(): string {
  return renderHelp({
    sections: [
      {
        title: "Usage",
        items: [
          "  fide workspace settings set [--workspace <workspace-id>] (--stdin|--file <path>|'<json>') [--pretty|-p]",
        ],
      },
    ],
  });
}

async function readSettingsInput(positionals: string[], flags: Map<string, string | boolean>): Promise<string> {
  const file = typeof flags.get("file") === "string" ? String(flags.get("file")) : null;
  if (file) {
    return readUtf8(file);
  }

  if (flags.has("stdin")) {
    return await new Promise<string>((resolve, reject) => {
      let input = "";
      process.stdin.setEncoding("utf8");
      process.stdin.on("data", (chunk) => {
        input += chunk;
      });
      process.stdin.on("end", () => resolve(input));
      process.stdin.on("error", reject);
      process.stdin.resume();
    });
  }

  if (positionals.length === 0) {
    throw new Error("Missing settings input. Pass --file <path>, --stdin, or a JSON positional argument.");
  }
  if (positionals.length > 1) {
    throw new Error("Workspace settings input accepts only one positional JSON value.");
  }
  return positionals[0];
}

export async function runWorkspaceSettingsSet(args: string[]): Promise<number> {
  const { flags, positionals } = parseArgs(args);
  const useJson = shouldUseJsonOutput(flags);
  if (flags.has("help")) {
    console.log(settingsSetHelp());
    return 0;
  }

  const selection = await resolveWorkspaceSelectionOrThrow(flags);
  const rawInput = await readSettingsInput(positionals, flags);
  const parsed = JSON.parse(rawInput) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Workspace settings must be a JSON object.");
  }

  const { auth, client } = await requireWorkspaceApiClient();
  const result = await client.setWorkspaceSettings(selection.workspaceId, parsed as Record<string, unknown>);
  const payload = okResponse("workspace-settings-set.v1", {
    baseUrl: auth.baseUrl,
    source: auth.source,
    workspaceId: selection.workspaceId,
    workspaceSelectionSource: selection.source,
    settings: result.settings,
  }, {
    command: "fide workspace settings set",
  });

  if (useJson) {
    printJson(payload);
  } else {
    console.log(JSON.stringify(payload.settings, null, 2));
  }
  return 0;
}
