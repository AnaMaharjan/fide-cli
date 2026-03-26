import { executeGraphQuery } from "@chris-test/graph-db";
import { renderCommandHelp } from "../../util/command-metadata.js";
import { printJson } from "../../util/io.js";
import { formatPretty } from "../../util/pretty.js";
import { okResponse } from "../../util/response.js";
import { requireWorkspaceApiClient, runHostedOperation } from "../workspace/shared.js";
import { queryRunCommand } from "./metadata.js";
import {
  assertLocalQueryableStore,
  getLocalFideWarnings,
  isWorkspaceScope,
  parseArgs,
  readProjectQueryOrThrow,
  requireGraphKey,
  resolveGraphQueryScope,
  resolveGraphTarget,
  resolveQuerySql,
  resolveStoreTarget,
  shouldUseJsonOutput,
} from "./shared.js";
import { resolveWorkspaceSelectionOrThrow } from "../../util/workspace-settings.js";

export async function runQueryRun(args: string[]): Promise<number> {
  const initialParsed = parseArgs(args);
  if (initialParsed.flags.has("help") || initialParsed.flags.has("-h")) {
    console.log(renderCommandHelp(queryRunCommand));
    return 0;
  }

  const flags = initialParsed.flags;
  const name = flags.get("name");
  if (typeof name !== "string" || !name) {
    const { parsed, sql } = await resolveQuerySql(args);
    const resolvedFlags = parsed.flags;
    const graphKey = requireGraphKey(resolvedFlags);
    if (!sql.trim()) {
      console.error("Missing query text for `fide query run`. Use `--stdin`, `--file <path>`, or pass the query inline.");
      console.error(renderCommandHelp(queryRunCommand));
      return 1;
    }
    const target = assertLocalQueryableStore(
      graphKey,
      resolveStoreTarget(new Map<string, string | boolean>([["graph", graphKey]])),
      resolvedFlags,
    );
    const result = await executeGraphQuery({
      target,
      sql,
      allowWrite: resolvedFlags.has("allow-write"),
    });
    const localTarget = resolveGraphTarget(resolvedFlags);
    const payload = {
      targetScope: "local",
      ...result,
      ...("file" in result ? { warnings: getLocalFideWarnings(localTarget.root, { gitignore: localTarget.gitignore }) } : {}),
    };
    if (shouldUseJsonOutput(resolvedFlags)) {
      printJson(payload);
    } else {
      console.log(formatPretty("graph-query-run-local.v1", payload));
    }
    return 0;
  }

  const graphKey = requireGraphKey(flags);
  const limitFlag = flags.get("limit");
  const limit = typeof limitFlag === "string" ? Number(limitFlag) : undefined;
  if (typeof limitFlag === "string" && (!Number.isInteger(limit) || Number(limit) <= 0)) {
    throw new Error("Invalid --limit value. Expected a positive integer.");
  }

  const queryScope = await resolveGraphQueryScope(flags);
  if (isWorkspaceScope(queryScope)) {
    const useJson = shouldUseJsonOutput(flags);
    const selection = await resolveWorkspaceSelectionOrThrow(flags);
    const { auth, client } = await requireWorkspaceApiClient(flags);
    const result = await runHostedOperation(
      () => client.runGraphQuery({
        workspaceId: selection.workspaceId,
        graphKey,
        name,
        ...(typeof limit === "number" ? { limit } : {}),
      }),
      {
        auth,
        client,
        targetScope: "workspace",
        workspaceId: selection.workspaceId,
        workspaceSelectionSource: selection.source,
        graphKey,
        queryName: name,
      },
    );
    const payload = okResponse("graph-query-run-workspace.v1", {
      targetScope: "workspace",
      baseUrl: auth.baseUrl,
      source: auth.source,
      workspaceId: selection.workspaceId,
      workspaceSelectionSource: selection.source,
      result,
    }, {
      command: "fide query run",
      next: {
        get: `fide query get --graph ${graphKey} --name ${name}`,
      },
    });

    if (useJson) {
      printJson(payload);
    } else {
      console.log(formatPretty("graph-query-run-workspace.v1", payload));
    }
    return 0;
  }

  const { query } = await readProjectQueryOrThrow(flags);
  const target = assertLocalQueryableStore(
    graphKey,
    resolveStoreTarget(new Map<string, string | boolean>([["graph", graphKey]])),
    flags,
  );
  const result = await executeGraphQuery({
    target,
    sql: query.sql,
    allowWrite: flags.has("allow-write"),
  });
  const localTarget = resolveGraphTarget(flags);
  const payload = {
    targetScope: "local",
    ...result,
    ...("file" in result ? { warnings: getLocalFideWarnings(localTarget.root, { gitignore: localTarget.gitignore }) } : {}),
  };
  if (shouldUseJsonOutput(flags)) {
    printJson(payload);
  } else {
    console.log(formatPretty("graph-query-run-local.v1", payload));
  }
  return 0;
}
