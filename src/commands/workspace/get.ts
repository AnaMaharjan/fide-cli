import { parseArgs, shouldUseJsonOutput } from "../../util/command/args.js";
import {
  booleanKeysFromCommand,
  defineCommand,
  mergeBooleanKeySets,
  renderCommandHelp,
} from "../../util/command/command-metadata.js";
import { printJson } from "../../util/command/io.js";
import { formatPretty } from "../../util/command/pretty.js";
import { okResponse } from "../../util/command/response.js";
import { requireHostedWorkspaceTarget, requireWorkspaceApiClient, runHostedOperation } from "./shared.js";

export const workspaceGetCommand = defineCommand({
  surface: "workspace.get",
  command: "fide workspace get",
  outputType: "WorkspaceGetOutput",
  summary: "Inspect a workspace by id",
  usage: ["fide workspace get [--pretty|-p]"],
  paramOrder: ["pretty"],
  params: {
    pretty: { kind: "boolean", shorthand: "-p", description: "Human-readable output" },
  },
});

const WORKSPACE_GET_PARSE_KEYS = mergeBooleanKeySets(booleanKeysFromCommand(workspaceGetCommand));

export type WorkspaceGetOutput = {
  ok: true;
  scope: "workspace-get.v1";
  baseUrl: string;
  source: string;
  workspace: Record<string, unknown>;
};

export async function runWorkspaceGet(args: string[]): Promise<number> {
  const { flags } = parseArgs(args, { booleanKeys: WORKSPACE_GET_PARSE_KEYS });
  const useJson = shouldUseJsonOutput(flags);
  if (flags.has("help")) {
    console.log(renderCommandHelp(workspaceGetCommand));
    return 0;
  }

  const selection = await requireHostedWorkspaceTarget();
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
