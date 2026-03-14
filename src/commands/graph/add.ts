import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { pgClient } from "@chris-test/db";
import { parseFideId } from "@chris-test/graph";
import { getStringFlag, hasFlag, parseArgs, shouldUseJsonOutput } from "../../util/args.js";
import { renderHelp } from "../../util/help.js";
import { applyFieldMask, printJson, writeUtf8 } from "../../util/io.js";
import { resolveGraphTarget } from "../../util/graph/target.js";
import { ensureSqliteGraphSchema, ingestStatementsToSqlite } from "../../util/graph/sqlite.js";
import { getLocalWorkspaceWarnings, getSqliteWarnings } from "../../util/graph/local-disk-warning.js";
import { resolveStatementsBatch, ymdUtc } from "./shared.js";

function addHelp(): string {
  return renderHelp({
    sections: [
      {
        title: "Usage",
        items: [
          "  fide graph add [--target <key-or-path>] <json>",
          "  fide graph add [--target <key-or-path>] --file <inputs> [--format <json|jsonl|fsd>]",
          "  fide graph add [--target <key-or-path>] --stdin [--format <json|jsonl|fsd>]",
        ],
      },
      {
        title: "Flags",
        items: [
          "  --target <key-or-path>   Configured graph target key or local workspace path",
          "  --file <inputs>          Read statement inputs from a file",
          "  --stdin                  Read statement inputs from stdin",
          "  --format <json|jsonl|fsd>  Force input format",
          "  --no-normalize           Disable reference identifier normalization",
          "  --pretty, -p             Human-readable output",
        ],
      },
    ],
  });
}

/**
 * Resolve project statements output directory under `.fide/statements`.
 */
function resolveStatementsDir(root: string): string {
  const fideDir = resolve(root, ".fide");
  if (!existsSync(fideDir)) {
    throw new Error("No .fide folder found in the target directory. Run this command from your project root, configure .fide/settings.json, pass --target <path>, or run `fide graph init` first.");
  }
  return resolve(fideDir, "statements");
}

function quoteIdent(value: string): string {
  return `"${value.replaceAll("\"", "\"\"")}"`;
}

async function ingestStatementsToConfiguredTable(
  statements: Array<{
    statementFideId?: `did:fide:0x${string}`;
    subjectFideId: `did:fide:0x${string}`;
    subjectReferenceIdentifier: string;
    predicateFideId: `did:fide:0x${string}`;
    predicateReferenceIdentifier: string;
    objectFideId: `did:fide:0x${string}`;
    objectReferenceIdentifier: string;
  }>,
  schema: string,
  statementsTable: string,
): Promise<number> {
  const schemaSql = quoteIdent(schema);
  const statementsTableSql = quoteIdent(statementsTable);
  const statementsQualified = `${schemaSql}.${statementsTableSql}`;
  const referenceIdentifiersQualified = `${schemaSql}."reference_identifiers"`;

  const referenceMap = new Map<string, string>();
  const statementMap = new Map<string, {
    statementFingerprint: string;
    subjectType: string;
    subjectReferenceType: string;
    subjectFingerprint: string;
    predicateFingerprint: string;
    objectType: string;
    objectReferenceType: string;
    objectFingerprint: string;
  }>();

  for (const statement of statements) {
    if (!statement.statementFideId) {
      throw new Error("Invalid statement: missing statementFideId.");
    }
    const subject = parseFideId(statement.subjectFideId);
    const predicate = parseFideId(statement.predicateFideId);
    const object = parseFideId(statement.objectFideId);
    const statementId = parseFideId(statement.statementFideId);

    referenceMap.set(subject.fingerprint, statement.subjectReferenceIdentifier);
    referenceMap.set(predicate.fingerprint, statement.predicateReferenceIdentifier);
    referenceMap.set(object.fingerprint, statement.objectReferenceIdentifier);

    statementMap.set(statementId.fingerprint, {
      statementFingerprint: statementId.fingerprint,
      subjectType: subject.typeChar,
      subjectReferenceType: subject.referenceChar,
      subjectFingerprint: subject.fingerprint,
      predicateFingerprint: predicate.fingerprint,
      objectType: object.typeChar,
      objectReferenceType: object.referenceChar,
      objectFingerprint: object.fingerprint,
    });
  }

  for (const [identifierFingerprint, referenceIdentifier] of referenceMap.entries()) {
    await pgClient.unsafe(
      `INSERT INTO ${referenceIdentifiersQualified} (identifier_fingerprint, reference_identifier)
       VALUES ($1, $2)
       ON CONFLICT (identifier_fingerprint) DO NOTHING`,
      [identifierFingerprint, referenceIdentifier],
    );
  }

  for (const row of statementMap.values()) {
    await pgClient.unsafe(
      `INSERT INTO ${statementsQualified} (
        statement_fingerprint,
        subject_type,
        subject_reference_type,
        subject_fingerprint,
        predicate_fingerprint,
        object_type,
        object_reference_type,
        object_fingerprint
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      ON CONFLICT (statement_fingerprint) DO NOTHING`,
      [
        row.statementFingerprint,
        row.subjectType,
        row.subjectReferenceType,
        row.subjectFingerprint,
        row.predicateFingerprint,
        row.objectType,
        row.objectReferenceType,
        row.objectFingerprint,
      ],
    );
  }

  return statementMap.size;
}

/**
 * Build a statements batch and write it to `.fide/statements/YYYY/MM/DD/<root>.jsonl`.
 */
export async function runGraphAdd(argsOrFlags: string[] | Map<string, string | boolean>): Promise<number> {
  const initialParsed = argsOrFlags instanceof Map ? { positionals: [], flags: argsOrFlags } : parseArgs(argsOrFlags);
  if (hasFlag(initialParsed.flags, "help")) {
    console.log(addHelp());
    return 0;
  }
  if (hasFlag(initialParsed.flags, "draft")) {
    throw new Error("`graph add` no longer supports `--draft`. Use `fide graph draft`.");
  }
  const { parsed, batch, statementInputs } = await resolveStatementsBatch(argsOrFlags);
  const flags = parsed.flags;

  const graphTarget = resolveGraphTarget(flags);
  if (hasFlag(flags, "out")) {
    throw new Error("`graph add` no longer accepts --out. Output path is auto-generated.");
  }
  if (statementInputs.length === 0) {
    console.error("Missing input for `graph add`. Use `--stdin`, `--file <path>`, or pass JSON inline.");
    console.error(addHelp());
    return 1;
  }
  if (graphTarget.type === "postgres") {
    if (!graphTarget.databaseUrl) {
      throw new Error(
        `Missing postgres connection for graph target "${graphTarget.key ?? "unknown"}". Set FIDE_GRAPH_DATABASE_URL or configure the target in .fide/settings.json.`,
      );
    }

    process.env.DATABASE_URL = graphTarget.databaseUrl;
    const statementCount = await ingestStatementsToConfiguredTable(
      batch.statements,
      graphTarget.schema,
      graphTarget.statementsTable,
    );
    const payload = {
      root: batch.root,
      statementCount,
      mode: "postgres",
      target: "postgres",
      key: graphTarget.key,
      schema: graphTarget.schema,
      statementsTable: graphTarget.statementsTable,
    };
    if (shouldUseJsonOutput(flags)) {
      printJson(applyFieldMask(payload, getStringFlag(flags, "fields")));
    } else {
      console.log(
        `Ingested ${statementCount} statements (root=${batch.root}) to postgres target ${graphTarget.key ?? "<unnamed>"} (${graphTarget.schema}.${graphTarget.statementsTable}).`,
      );
    }
    return 0;
  }

  if (graphTarget.type === "sqlite") {
    await mkdir(resolve(graphTarget.file, ".."), { recursive: true });
    await ensureSqliteGraphSchema(graphTarget.file, { drop: false });
    const statementCount = await ingestStatementsToSqlite(graphTarget.file, batch.statements);
    const payload = {
      root: batch.root,
      statementCount,
      mode: "sqlite",
      target: "sqlite",
      key: graphTarget.key,
      file: graphTarget.file,
      warnings: getSqliteWarnings(graphTarget.file, { gitignore: graphTarget.gitignore }),
    };
    if (shouldUseJsonOutput(flags)) {
      printJson(applyFieldMask(payload, getStringFlag(flags, "fields")));
    } else {
      console.log(
        `Ingested ${statementCount} statements (root=${batch.root}) to sqlite target ${graphTarget.key ?? "<unnamed>"} (${graphTarget.file}).`,
      );
    }
    return 0;
  }

  const { root } = graphTarget;
  const outPath = (() => {
    const { yyyy, mm, dd } = ymdUtc(new Date());
    return resolve(resolveStatementsDir(root), yyyy, mm, dd, `${batch.root}.jsonl`);
  })();

  const wires = batch.statements.map((statement) => ({
    s: statement.subjectFideId,
    sr: statement.subjectReferenceIdentifier,
    p: statement.predicateFideId,
    pr: statement.predicateReferenceIdentifier,
    o: statement.objectFideId,
    or: statement.objectReferenceIdentifier,
  }));
  const output = `${wires.map((wire) => JSON.stringify(wire)).join("\n")}\n`;

  await mkdir(resolve(outPath, ".."), { recursive: true });
  await writeUtf8(outPath, output);

  const payload = {
    root: batch.root,
    statementCount: batch.statements.length,
    mode: "batch",
    outPath,
    warnings: getLocalWorkspaceWarnings(root, { gitignore: graphTarget.gitignore }),
  };
  if (shouldUseJsonOutput(flags)) {
    printJson(applyFieldMask(payload, getStringFlag(flags, "fields")));
  } else {
    console.log(outPath);
  }
  return 0;
}
