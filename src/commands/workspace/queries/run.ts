import { getStringFlag, parseArgs, shouldUseJsonOutput } from "../../../util/args.js";
import { printJson } from "../../../util/io.js";
import { okResponse } from "../../../util/response.js";
import { resolveWorkspaceSelectionOrThrow } from "../../../util/workspace-settings.js";
import { requireWorkspaceApiClient } from "../shared.js";

export async function runWorkspaceQueriesRun(args: string[]): Promise<number> {
  const { flags } = parseArgs(args);
  const useJson = shouldUseJsonOutput(flags);
  const graphKey = getStringFlag(flags, "graph");
  const name = getStringFlag(flags, "name");
  const queryStore = getStringFlag(flags, "query-store");
  const limitFlag = getStringFlag(flags, "limit");

  if (!graphKey) throw new Error("Missing required flag: --graph <key>.");
  if (!name) throw new Error("Missing required flag: --name");
  const limit = limitFlag ? Number(limitFlag) : undefined;
  if (limitFlag && (!Number.isInteger(limit) || Number(limit) <= 0)) {
    throw new Error("Invalid --limit value. Expected a positive integer.");
  }

  const selection = await resolveWorkspaceSelectionOrThrow(flags);
  const { auth, client } = await requireWorkspaceApiClient();
  const result = await client.runWorkspaceQuery({
    workspaceId: selection.workspaceId,
    graphKey,
    name,
    ...(queryStore ? { queryStore } : {}),
    ...(typeof limit === "number" ? { limit } : {}),
  });

  const payload = okResponse("workspace-query-run.v1", {
    baseUrl: auth.baseUrl,
    source: auth.source,
    workspaceId: selection.workspaceId,
    workspaceSelectionSource: selection.source,
    result,
  }, {
    command: "fide workspace queries run",
    next: {
      get: `fide workspace queries get --workspace ${selection.workspaceId} --graph ${graphKey} --name ${name}${queryStore ? ` --query-store ${queryStore}` : ""}`,
    },
  });

  if (useJson) {
    printJson(payload);
  } else {
    console.log(JSON.stringify(result.rows, null, 2));
  }
  return 0;
}
