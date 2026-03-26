import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { renderCommandHelp } from "../../util/command/command-metadata.js";
import { printJson, writeUtf8 } from "../../util/command/io.js";
import { formatPretty } from "../../util/command/pretty.js";
import { querySaveCommand } from "./metadata.js";
import {
  assertLocalQueryCommand,
  getLocalFideWarnings,
  parseArgs,
  readLocalQueries,
  renderLocalQueryFileWithDescriptionLine,
  requireGraphKey,
  requireSavedQueryName,
  resolveDescriptionUpdate,
  resolveGraphTarget,
  resolveQueriesDir,
  resolveQuerySaveInput,
  shouldUseJsonOutput,
} from "./shared.js";

export async function runQuerySave(args: string[]): Promise<number> {
  const initialParsed = parseArgs(args);
  if (initialParsed.flags.has("help") || initialParsed.flags.has("-h")) {
    console.log(renderCommandHelp(querySaveCommand));
    return 0;
  }
  assertLocalQueryCommand(initialParsed.flags, "fide query save");

  const { parsed, sql, fileDescription } = await resolveQuerySaveInput(args);
  const flags = parsed.flags;
  const graphKey = requireGraphKey(flags);
  const name = requireSavedQueryName(flags);
  const descriptionUpdate = resolveDescriptionUpdate(flags, fileDescription);

  const graphTarget = resolveGraphTarget(flags);
  if (graphTarget.type !== "local") {
    throw new Error("`fide query save` only supports project `.fide` directories.");
  }

  const existingQueries = await readLocalQueries(graphTarget.root);
  const existingQuery = existingQueries.find((entry) => entry.graphKey === graphKey && entry.name === name) ?? null;
  const resolvedSql = sql.trim() ? sql : existingQuery?.sql ?? "";
  const description = descriptionUpdate.mode === "set"
    ? descriptionUpdate.value
    : existingQuery?.description ?? null;
  if (!resolvedSql.trim()) {
    console.error("Missing SQL for `fide query save`. Use `--stdin`, `--file <path>`, pass SQL inline, or target an existing saved query.");
    console.error(renderCommandHelp(querySaveCommand));
    return 1;
  }

  const outPath = resolve(resolveQueriesDir(graphTarget.root), graphKey, `${name}.sql`);
  await mkdir(resolve(outPath, ".."), { recursive: true });
  await writeUtf8(outPath, renderLocalQueryFileWithDescriptionLine(
    resolvedSql,
    description ?? null,
  ));

  const payload = {
    ok: true,
    targetScope: "local",
    mode: "query",
    graphKey,
    name,
    outPath,
    warnings: getLocalFideWarnings(graphTarget.root, { gitignore: graphTarget.gitignore }),
  };
  if (shouldUseJsonOutput(flags)) {
    printJson(payload);
  } else {
    console.log(formatPretty("graph-query-save-local.v1", payload));
  }
  return 0;
}
