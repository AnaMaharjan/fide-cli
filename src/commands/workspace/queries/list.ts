import { getStringFlag, parseArgs, shouldUseJsonOutput } from "../../../util/args.js";
import { printJson } from "../../../util/io.js";
import { okResponse } from "../../../util/response.js";
import { resolveWorkspaceSelectionOrThrow } from "../../../util/workspace-settings.js";
import { requireWorkspaceApiClient } from "../shared.js";

export async function runWorkspaceQueriesList(args: string[]): Promise<number> {
  const { flags } = parseArgs(args);
  const useJson = shouldUseJsonOutput(flags);
  const queryStore = getStringFlag(flags, "query-store");

  const selection = await resolveWorkspaceSelectionOrThrow(flags);
  const { auth, client } = await requireWorkspaceApiClient();
  const result = await client.listWorkspaceQueries({
    workspaceId: selection.workspaceId,
    ...(queryStore ? { queryStore } : {}),
  });

  const next: Record<string, string> = {}
  const first = result.queries[0]
  if (first) {
    next.get = `fide workspace queries get --workspace ${selection.workspaceId} --statement-store ${first.statementStoreKey} --name ${first.name}${queryStore ? ` --query-store ${queryStore}` : ""}`
  }

  const payload = okResponse("workspace-queries-list.v1", {
    baseUrl: auth.baseUrl,
    source: auth.source,
    workspaceId: selection.workspaceId,
    workspaceSelectionSource: selection.source,
    queryStoreKey: result.queryStoreKey,
    queries: result.queries,
  }, {
    command: "fide workspace queries list",
    ...(Object.keys(next).length > 0 ? { next } : {}),
  });

  if (useJson) {
    printJson(payload);
  } else {
    for (const query of result.queries) {
      console.log(`${query.statementStoreKey} ${query.name}`);
    }
  }
  return 0;
}
