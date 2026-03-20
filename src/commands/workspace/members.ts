import { getStringFlag, parseArgs, shouldUseJsonOutput } from "../../util/args.js";
import { renderHelp } from "../../util/help.js";
import { printJson } from "../../util/io.js";
import { okResponse } from "../../util/response.js";
import { requireWorkspaceApiClient } from "./shared.js";

function membersHelp(): string {
  return renderHelp({
    sections: [
      {
        title: "Usage",
        items: [
          "  fide workspace members --id <workspace-id> [--pretty|-p]",
        ],
      },
    ],
  });
}

export async function runWorkspaceMembers(args: string[]): Promise<number> {
  const { flags } = parseArgs(args);
  const useJson = shouldUseJsonOutput(flags);
  if (flags.has("help")) {
    console.log(membersHelp());
    return 0;
  }

  const id = getStringFlag(flags, "id");
  if (!id) {
    throw new Error("Missing required flag: --id");
  }

  const { auth, client } = await requireWorkspaceApiClient();
  const result = await client.listWorkspaceMembers(id);
  const payload = okResponse("workspace-members.v1", {
    baseUrl: auth.baseUrl,
    source: auth.source,
    workspaceId: id,
    members: result.members,
  }, {
    command: "fide workspace members",
    next: {
      serviceAccountCreate: `fide workspace service-accounts create --workspace-id ${id} --label '<label>' --role workspace.member`,
    },
  });

  if (useJson) {
    printJson(payload);
  } else {
    for (const member of result.members) {
      console.log(`${member.userId} ${member.userType ?? "unknown"} roles=${member.roles.join(",")} permissions=${member.permissions.join(",")}`);
    }
  }
  return 0;
}
