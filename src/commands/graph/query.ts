import { createPgClient } from "@chris-test/db";
import { getStringFlag, hasFlag, parseArgs, shouldUseJsonOutput } from "../../util/args.js";
import { renderHelp } from "../../util/help.js";
import { applyFieldMask, printJson, readUtf8 } from "../../util/io.js";
import { resolveGraphTarget } from "../../util/graph-target.js";
import { executeSqliteQuery } from "../../util/sqlite.js";
import { getSqliteWarnings } from "../../util/sqlite-warning.js";
import { readStdinUtf8 } from "./shared.js";

function quoteIdent(value: string): string {
  return `"${value.replaceAll("\"", "\"\"")}"`;
}

function queryHelp(): string {
  return renderHelp({
    sections: [
      {
        title: "Usage",
        items: [
          "  fide graph query [--target <key-or-path>] <sql>",
          "  fide graph query [--target <key-or-path>] --file <query.sql>",
          "  fide graph query [--target <key-or-path>] --stdin",
        ],
      },
      {
        title: "Flags",
        items: [
          "  --target <key-or-path>   Configured graph target key or jsonl directory path",
          "  --file <query.sql>       Read SQL from a file",
          "  --stdin                  Read SQL from stdin",
          "  --allow-write            Allow write SQL",
          "  --fields <mask>          Output field mask (e.g. rows,rowCount)",
          "  --pretty, -p             Human-readable output",
        ],
      },
      {
        title: "Examples",
        items: [
          "  fide graph query --target primary 'select * from statements limit 10'",
          "  fide graph query --target sqlite 'select * from statements limit 10'",
          "  fide graph query --target primary --file queries/statements.sql",
        ],
      },
    ],
  });
}

function isReadOnlySql(sql: string): boolean {
  const normalized = sql
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--.*$/gm, " ")
    .trim()
    .toLowerCase();
  if (normalized.length === 0) return true;
  return /^(select|with|pragma\s+table_info|pragma\s+index_list|pragma\s+index_info|explain|values)\b/.test(normalized);
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

export async function runGraphQuery(args: string[]): Promise<number> {
  const initialParsed = parseArgs(args);
  if (hasFlag(initialParsed.flags, "help")) {
    console.log(queryHelp());
    return 0;
  }

  const { parsed, sql } = await resolveQuerySql(args);
  const flags = parsed.flags;
  if (!sql.trim()) {
    console.error("Missing SQL for `graph query`. Use `--stdin`, `--file <path>`, or pass SQL inline.");
    console.error(queryHelp());
    return 1;
  }

  const allowWrite = hasFlag(flags, "allow-write");
  if (!allowWrite && !isReadOnlySql(sql)) {
    throw new Error("Write SQL requires `--allow-write`.");
  }

  const graphTarget = resolveGraphTarget(flags);
  if (graphTarget.type === "jsonl") {
    throw new Error("`graph query` does not support jsonl targets. Use a configured sqlite or postgres target.");
  }

  if (graphTarget.type === "postgres") {
    if (!graphTarget.databaseUrl) {
      throw new Error(
        `Missing postgres connection for graph target "${graphTarget.key ?? "unknown"}". Set FIDE_GRAPH_DATABASE_URL or configure the target in .fide/settings.json.`,
      );
    }
    const client = createPgClient(graphTarget.databaseUrl);
    try {
      const rows = await client.begin(async (tx) => {
        await tx.unsafe(`SET LOCAL search_path TO ${quoteIdent(graphTarget.schema)};`);
        return tx.unsafe(sql) as Promise<unknown[]>;
      });
      const payload = {
        ok: true,
        target: "postgres",
        key: graphTarget.key,
        schema: graphTarget.schema,
        statementsTable: graphTarget.statementsTable,
        rowCount: rows.length,
        rows,
      };
      if (shouldUseJsonOutput(flags)) {
        printJson(applyFieldMask(payload, getStringFlag(flags, "fields")));
      } else {
        console.log(JSON.stringify(rows, null, 2));
      }
      return 0;
    } finally {
      await client.end({ timeout: 1 });
    }
  }

  const result = await executeSqliteQuery(graphTarget.file, sql, { allowWrite });
  const payload = {
    ok: true,
    target: "sqlite",
    key: graphTarget.key,
    file: graphTarget.file,
    rowCount: result.rows.length,
    rows: result.rows,
    warnings: getSqliteWarnings(graphTarget.file, { gitignore: graphTarget.gitignore }),
  };
  if (shouldUseJsonOutput(flags)) {
    printJson(applyFieldMask(payload, getStringFlag(flags, "fields")));
  } else {
    console.log(JSON.stringify(result.rows, null, 2));
  }
  return 0;
}
