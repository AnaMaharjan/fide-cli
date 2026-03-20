import { getStringFlag, parseArgs, shouldUseJsonOutput } from "../../../util/args.js";
import { printJson } from "../../../util/io.js";
import { okResponse } from "../../../util/response.js";
import { resolveWorkspaceSelectionOrThrow } from "../../../util/workspace-settings.js";
import { requireWorkspaceApiClient } from "../shared.js";

export async function runWorkspaceQueriesGet(args: string[]): Promise<number> {
  const { flags } = parseArgs(args);
  const useJson = shouldUseJsonOutput(flags);
  const statementStoreKey = getStringFlag(flags, "statement-store");
  const name = getStringFlag(flags, "name");
  const queryStore = getStringFlag(flags, "query-store");

  if (!statementStoreKey) throw new Error("Missing required flag: --statement-store");
  if (!name) throw new Error("Missing required flag: --name");

  const selection = await resolveWorkspaceSelectionOrThrow(flags);
  const { auth, client } = await requireWorkspaceApiClient();
  const query = await client.getWorkspaceQuery({
    workspaceId: selection.workspaceId,
    statementStoreKey,
    name,
    ...(queryStore ? { queryStore } : {}),
  });

  const payload = okResponse("workspace-query-get.v1", {
    baseUrl: auth.baseUrl,
    source: auth.source,
    workspaceId: selection.workspaceId,
    workspaceSelectionSource: selection.source,
    query,
  }, {
    command: "fide workspace queries get",
    next: {
      list: `fide workspace queries list --workspace ${selection.workspaceId}${queryStore ? ` --query-store ${queryStore}` : ""}`,
    },
  });

  if (useJson) {
    printJson(payload);
  } else {
    console.log(query.sql);
  }
  return 0;
}
