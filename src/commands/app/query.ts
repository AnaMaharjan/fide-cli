import { createPgClient } from "@chris-test/db";
import { getStringFlag, hasFlag, parseArgs, shouldUseJsonOutput } from "../../util/args.js";
import { renderHelp } from "../../util/help.js";
import { applyFieldMask, printJson, readUtf8 } from "../../util/io.js";
import { resolveAppTarget } from "../../util/app/target.js";
import { readStdinUtf8 } from "../graph/shared.js";

function queryHelp(): string {
  return renderHelp({
    sections: [
      {
        title: "Usage",
        items: [
          "  fide app query --graph <graph-id> --save <name> <sql>",
          "  fide app query --graph <graph-id> --save <name> --file <query.sql>",
          "  fide app query --graph <graph-id> --save <name> --stdin",
        ],
      },
      {
        title: "Flags",
        items: [
          "  --target <key>         Configured app target key (default: first app target)",
          "  --graph <graph-id>     Graph target id the saved query runs against",
          "  --save <name>          Save or update the query under this name",
          "  --description <text>   Optional query description",
          "  --file <query.sql>     Read SQL from a file",
          "  --stdin                Read SQL from stdin",
          "  --fields <mask>        Output field mask",
          "  --pretty, -p           Human-readable output",
        ],
      },
      {
        title: "Examples",
        items: [
          "  fide app query --graph combined --save recentStatements 'select * from statements limit 10'",
          "  fide app query --target postgres --graph combined --file queries/top-predicates.sql --save topPredicates",
        ],
      },
    ],
  });
}

async function resolveQuerySql(args: string[]): Promise<{ parsed: ReturnType<typeof parseArgs>; sql: string }> {
  const parsed = parseArgs(args);
  const flags = parsed.flags;
  const filePath = getStringFlag(flags, "file");
  const useStdin = hasFlag(flags, "stdin");
  const stdinAvailable = process.stdin.isTTY === false;
  const inlineSql = parsed.positionals.join(" ").trim();

  if (filePath) {
    return { parsed, sql: await readUtf8(filePath) };
  }
  if (useStdin) {
    return { parsed, sql: await readStdinUtf8() };
  }
  if (inlineSql.length > 0) {
    return { parsed, sql: inlineSql };
  }
  if (stdinAvailable) {
    return { parsed, sql: await readStdinUtf8() };
  }
  return { parsed, sql: "" };
}

export async function runAppQuery(args: string[]): Promise<number> {
  const initialParsed = parseArgs(args);
  if (hasFlag(initialParsed.flags, "help") || hasFlag(initialParsed.flags, "-h")) {
    console.log(queryHelp());
    return 0;
  }

  const { parsed, sql } = await resolveQuerySql(args);
  const flags = parsed.flags;
  const graphId = getStringFlag(flags, "graph");
  const saveName = getStringFlag(flags, "save");
  const description = getStringFlag(flags, "description");

  if (!graphId) {
    throw new Error("Missing required flag: --graph <graph-id>.");
  }
  if (!saveName) {
    throw new Error("Missing required flag: --save <name>.");
  }
  if (!sql.trim()) {
    console.error("Missing SQL for `app query`. Use `--stdin`, `--file <path>`, or pass SQL inline.");
    console.error(queryHelp());
    return 1;
  }

  const appTarget = resolveAppTarget(flags);
  if (!appTarget.databaseUrl) {
    throw new Error(
      `Missing postgres connection for app target "${appTarget.key ?? "unknown"}". Configure the target in .fide/settings.json or set the referenced env var.`,
    );
  }

  const client = createPgClient(appTarget.databaseUrl);
  try {
    const rows = await client.begin(async (tx) => {
      await tx.unsafe(`SET LOCAL search_path TO "${appTarget.schema.replaceAll("\"", "\"\"")}";`);
      return tx.unsafe(
        `
        INSERT INTO graph_queries (name, graph_id, sql, description)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (name)
        DO UPDATE SET
          graph_id = EXCLUDED.graph_id,
          sql = EXCLUDED.sql,
          description = EXCLUDED.description,
          updated_at = NOW()
        RETURNING name, graph_id, sql, description, created_at, updated_at
        `,
        [
          saveName,
          graphId,
          sql.trim(),
          description,
        ],
      ) as Promise<Array<Record<string, unknown>>>;
    });

    const payload = {
      ok: true,
      target: "app",
      key: appTarget.key,
      schema: appTarget.schema,
      saved: rows[0] ?? null,
    };

    if (shouldUseJsonOutput(flags)) {
      printJson(applyFieldMask(payload, getStringFlag(flags, "fields")));
    } else if (rows[0]) {
      console.log(`Saved query ${saveName} for graph ${graphId} in ${appTarget.schema}.graph_queries`);
    }
    return 0;
  } finally {
    await client.end({ timeout: 1 });
  }
}
