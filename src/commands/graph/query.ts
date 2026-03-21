import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { getStringFlag, hasFlag, parseArgs, shouldUseJsonOutput } from "../../util/args.js";
import { renderHelp } from "../../util/help.js";
import { printJson, readUtf8, writeUtf8 } from "../../util/io.js";
import { resolveGraphTarget } from "../../util/graph/target.js";
import { getLocalFideWarnings } from "../../util/graph/local-disk-warning.js";
import { renderCommandHelp } from "../../util/command-metadata.js";
import { renderQueryFile, resolveQueriesDir } from "../../util/query/files.js";
import { graphQueryCommand, graphQueryWriteCommand } from "./metadata.js";
import { runStoreSql } from "../store/sql.js";
import { readStdinUtf8 } from "./shared.js";

function queryCommandHelp(): string {
  return renderHelp({
    sections: [
      {
        title: "Usage",
        items: [
          "  fide graph query [flags] <query>",
          "  fide graph query --file <query.sql>",
          "  fide graph query --stdin",
          "  fide graph query write [flags]",
        ],
      },
      {
        title: "Commands",
        items: [
          `  write   ${graphQueryWriteCommand.summary}`,
        ],
      },
      {
        title: "Flags",
        items: [
          "  --graph <name>             Configured graph key",
          "  --file <query.sql>         Read SQL from a file",
          "  --stdin                    Read SQL from stdin",
          "  --allow-write              Allow write SQL",
          "  --pretty, -p               Human-readable output",
        ],
      },
      {
        title: "Examples",
        items: [
          `  ${graphQueryCommand.examples?.[0] ?? "fide graph query --graph primary 'select * from statements limit 10'"}`,
          `  ${graphQueryWriteCommand.examples?.[0] ?? "fide graph query write --graph primary --name recentStatements 'select * from statements limit 10'"}`,
        ],
      },
      {
        title: "Notes",
        items: [
          "  - `fide graph query` executes an ad hoc query against a configured graph.",
          "  - `fide graph query write` saves a local query definition under `.fide/queries/<graph>/<name>.sql`.",
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

export async function runGraphQueryWrite(args: string[]): Promise<number> {
  const initialParsed = parseArgs(args);
  if (hasFlag(initialParsed.flags, "help") || hasFlag(initialParsed.flags, "-h")) {
    console.log(renderCommandHelp(graphQueryWriteCommand));
    return 0;
  }

  const { parsed, sql } = await resolveQuerySql(args);
  const flags = parsed.flags;
  const graphKey = getStringFlag(flags, "graph");
  const name = getStringFlag(flags, "name");
  const description = getStringFlag(flags, "description");
  if (!graphKey) throw new Error("Missing required flag: --graph <name>.");
  if (!name) throw new Error("Missing required flag: --name <query-name>.");
  if (!sql.trim()) {
    console.error("Missing SQL for `graph query write`. Use `--stdin`, `--file <path>`, or pass SQL inline.");
    console.error(renderCommandHelp(graphQueryWriteCommand));
    return 1;
  }

  const graphTarget = resolveGraphTarget(flags);
  if (graphTarget.type !== "local") {
    throw new Error("`fide graph query write` only supports local .fide directories.");
  }

  const outPath = resolve(resolveQueriesDir(graphTarget.root), graphKey, `${name}.sql`);
  await mkdir(resolve(outPath, ".."), { recursive: true });
  await writeUtf8(outPath, renderQueryFile(sql, {
    graphKey,
    description: description ?? null,
  }));

  const payload = {
    ok: true,
    mode: "query",
    graphKey,
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

export async function runGraphQueryCommand(args: string[]): Promise<number> {
  const [first, ...rest] = args;

  if (!first || first === "--help" || first === "-h" || first === "help") {
    console.log(queryCommandHelp());
    return 0;
  }

  if (first === "write") {
    return runGraphQueryWrite(rest);
  }

  return runStoreSql(args, "graph");
}
