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
import { requireWorkspaceApiClient, runHostedOperation } from "./shared.js";

export const workspaceListCommand = defineCommand({
  surface: "workspace.list",
  command: "fide workspace list",
  outputType: "WorkspaceListOutput",
  summary: "List accessible workspaces",
  usage: ["fide workspace list [--pretty|-p]"],
  paramOrder: ["pretty"],
  params: {
    pretty: { kind: "boolean", shorthand: "-p", description: "Human-readable output" },
  },
});

const WORKSPACE_LIST_PARSE_KEYS = mergeBooleanKeySets(booleanKeysFromCommand(workspaceListCommand));

export type WorkspaceListOutput = {
  ok: true;
  scope: "workspace-list.v1";
  command?: string;
  next?: Record<string, unknown>;
  baseUrl: string;
  source: string;
  workspaces: unknown[];
};

export async function runWorkspaceList(args: string[]): Promise<number> {
  const { flags } = parseArgs(args, { booleanKeys: WORKSPACE_LIST_PARSE_KEYS });
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
          get: "fide workspace get",
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
