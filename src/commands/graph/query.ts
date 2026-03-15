import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { getStringFlag, hasFlag, parseArgs, shouldUseJsonOutput } from "../../util/args.js";
import { renderHelp } from "../../util/help.js";
import { printJson, readUtf8, writeUtf8 } from "../../util/io.js";
import { resolveGraphTarget } from "../../util/graph/target.js";
import { getLocalFideWarnings } from "../../util/graph/local-disk-warning.js";
import { renderQueryFile } from "../../util/query-files.js";
import { readStdinUtf8 } from "./shared.js";

function queryHelp(): string {
  return renderHelp({
    sections: [
      {
        title: "Usage",
        items: [
          "  fide graph query write --store <statement-store> --name <query-name> <sql>",
          "  fide graph query write --store <statement-store> --name <query-name> --file <query.sql>",
          "  fide graph query write --store <statement-store> --name <query-name> --stdin",
        ],
      },
      {
        title: "Flags",
        items: [
          "  --fide-dir <path>             Local .fide directory override",
          "  --store <statement-store>     Statement store key used by this query",
          "  --name <query-name>           Query file name without .sql",
          "  --description <text>          Optional leading description header",
          "  --file <query.sql>            Read SQL from a file",
          "  --stdin                       Read SQL from stdin",
          "  --pretty, -p                  Human-readable output",
        ],
      },
      {
        title: "Notes",
        items: [
          "  - Writes SQL files under .fide/queries/<statement-store>/<query-name>.sql.",
          "  - Description is stored as a leading `-- description: ...` line.",
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

  if (filePath) return { parsed, sql: await readUtf8(filePath) };
  if (useStdin) return { parsed, sql: await readStdinUtf8() };
  if (inlineSql.length > 0) return { parsed, sql: inlineSql };
  if (stdinAvailable) return { parsed, sql: await readStdinUtf8() };
  return { parsed, sql: "" };
}

export async function runGraphQuery(args: string[]): Promise<number> {
  const [subcommand, ...rest] = args;
  if (!subcommand || subcommand === "help" || subcommand === "--help" || subcommand === "-h") {
    console.log(queryHelp());
    return 0;
  }
  if (subcommand !== "write") {
    console.error(`Unknown graph query command: ${subcommand}`);
    console.error(queryHelp());
    return 1;
  }

  const initialParsed = parseArgs(rest);
  if (hasFlag(initialParsed.flags, "help")) {
    console.log(queryHelp());
    return 0;
  }

  const { parsed, sql } = await resolveQuerySql(rest);
  const flags = parsed.flags;
  const statementStoreKey = getStringFlag(flags, "store");
  const name = getStringFlag(flags, "name");
  const description = getStringFlag(flags, "description");
  if (!statementStoreKey) throw new Error("Missing required flag: --store <statement-store>.");
  if (!name) throw new Error("Missing required flag: --name <query-name>.");
  if (!sql.trim()) {
    console.error("Missing SQL for `graph query write`. Use `--stdin`, `--file <path>`, or pass SQL inline.");
    console.error(queryHelp());
    return 1;
  }

  const graphTarget = resolveGraphTarget(flags);
  if (graphTarget.type !== "local") {
    throw new Error("`fide graph query write` only supports local .fide directories.");
  }

  const outPath = resolve(graphTarget.root, ".fide", "queries", statementStoreKey, `${name}.sql`);
  await mkdir(resolve(outPath, ".."), { recursive: true });
  await writeUtf8(outPath, renderQueryFile(sql, description));

  const payload = {
    ok: true,
    statementStoreKey,
    name,
    outPath,
    warnings: getLocalFideWarnings(graphTarget.root, { gitignore: graphTarget.gitignore }),
  };
  if (shouldUseJsonOutput(flags)) {
    printJson(payload);
  } else {
    console.log(outPath);
  }
  return 0;
}
