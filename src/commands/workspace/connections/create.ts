import { getStringFlag, parseArgs, shouldUseJsonOutput } from "../../../util/args.js";
import { printJson } from "../../../util/io.js";
import { okResponse } from "../../../util/response.js";
import { resolveWorkspaceSelectionOrThrow } from "../../../util/workspace-settings.js";
import { requireWorkspaceApiClient } from "../shared.js";

export async function runWorkspaceConnectionsCreate(args: string[]): Promise<number> {
  const { flags } = parseArgs(args);
  const useJson = shouldUseJsonOutput(flags);

  const slug = getStringFlag(flags, "slug");
  const kind = getStringFlag(flags, "kind");
  const secretId = getStringFlag(flags, "secret-id");
  const connectionString = getStringFlag(flags, "connection");
  const description = getStringFlag(flags, "description");

  if (!slug) throw new Error("Missing required flag: --slug");
  if (!kind) throw new Error("Missing required flag: --kind");
  if (!secretId && !connectionString) {
    throw new Error("Missing required flag: provide either --secret-id or --connection");
  }
  if (secretId && connectionString) {
    throw new Error("Provide exactly one of --secret-id or --connection");
  }

  const selection = await resolveWorkspaceSelectionOrThrow(flags);
  const { auth, client } = await requireWorkspaceApiClient();
  const connection = await client.createWorkspaceConnection({
    workspaceId: selection.workspaceId,
    slug,
    kind,
    ...(description ? { description } : {}),
    ...(secretId ? { secretId } : { connection: connectionString! }),
  });

  const payload = okResponse("workspace-connections-create.v1", {
    baseUrl: auth.baseUrl,
    source: auth.source,
    workspaceId: selection.workspaceId,
    workspaceSelectionSource: selection.source,
    connection,
  }, {
    command: "fide workspace connections create",
    next: {
      list: `fide workspace connections list --workspace ${selection.workspaceId}`,
      settings: `fide workspace settings get --workspace ${selection.workspaceId}`,
    },
  });

  if (useJson) {
    printJson(payload);
  } else {
    console.log(`${connection.id} ${connection.slug} ${connection.kind}`);
  }
  return 0;
}
