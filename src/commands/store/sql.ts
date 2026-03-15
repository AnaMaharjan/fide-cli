import { createPgClient } from "@chris-test/db";
import { getStringFlag, hasFlag, parseArgs, shouldUseJsonOutput } from "../../util/args.js";
import { renderHelp } from "../../util/help.js";
import { applyFieldMask, printJson, readUtf8 } from "../../util/io.js";
import { resolveStoreTarget } from "../../util/graph/target.js";
import { executeSqliteQuery } from "../../util/graph/sqlite.js";
import { getSqliteWarnings } from "../../util/graph/local-disk-warning.js";
import { readStdinUtf8 } from "../graph/shared.js";

function quoteIdent(value: string): string {
  return `"${value.replaceAll("\"", "\"\"")}"`;
}

function sqlHelp(): string {
  return renderHelp({
    sections: [
      {
        title: "Usage",
        items: [
          "  fide store sql --store <name> <sql>",
          "  fide store sql --store <name> --file <query.sql>",
          "  fide store sql --store <name> --stdin",
        ],
      },
      {
        title: "Flags",
        items: [
          "  --store <name>           Configured sqlite or postgres store name",
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
          "  fide store sql --store primary 'select * from statements limit 10'",
          "  fide store sql --store sqlite 'select * from statements limit 10'",
          "  fide store sql --store primary --file queries/statements.sql",
        ],
      },
      {
        title: "Notes",
        items: [
          "  - `fide store sql` is for ad hoc SQL against built statement stores.",
          "  - Author statements and saved queries locally with `fide graph write`, then use `fide store build` to push them into stores.",
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

export async function runStoreSql(args: string[]): Promise<number> {
  const initialParsed = parseArgs(args);
  if (hasFlag(initialParsed.flags, "help")) {
    console.log(sqlHelp());
    return 0;
  }

  const { parsed, sql } = await resolveQuerySql(args);
  const flags = parsed.flags;
  if (!flags.has("store")) {
    throw new Error("Missing required flag: --store <name>.");
  }
  if (!sql.trim()) {
    console.error("Missing SQL for `store sql`. Use `--stdin`, `--file <path>`, or pass SQL inline.");
    console.error(sqlHelp());
    return 1;
  }

  const allowWrite = hasFlag(flags, "allow-write");
  if (flags.has("save") || flags.has("description") || flags.has("query-store")) {
    throw new Error("`fide store sql` no longer supports saved-query writes. Author queries locally, then build them into a query store.");
  }
  if (!allowWrite && !isReadOnlySql(sql)) {
    throw new Error("Write SQL requires `--allow-write`.");
  }

  const graphTarget = resolveStoreTarget(flags);

  if (graphTarget.type === "fide-jsonl") {
    throw new Error("`fide store sql` only supports sqlite and postgres stores. Use `fide graph write` for local `.fide` statements or build a sqlite/postgres store first.");
  }

  if (graphTarget.type === "postgres") {
    if (!graphTarget.databaseUrl) {
      throw new Error(
        `Missing postgres connection for store "${graphTarget.key ?? "unknown"}". Configure the store in settings.json or set the referenced env var.`,
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
        storeType: "postgres",
        key: graphTarget.key,
        schema: graphTarget.schema,
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
    storeType: "sqlite",
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
