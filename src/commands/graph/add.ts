import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { ingestStatements, pgClient } from "@chris-test/db";
import { buildStatementsWithRoot, parseFideId, statementDoc, type StatementInput } from "@chris-test/graph";
import { getStringFlag, hasFlag, parseArgs, shouldUseJsonOutput } from "../../util/args.js";
import { applyFieldMask, printJson, readUtf8, writeUtf8 } from "../../util/io.js";
import { COMMAND_SCHEMAS } from "../../util/schemas.js";
import { resolveGraphTarget } from "../../util/graph-target.js";
import { graphCommandHelp } from "./help.js";
import {
  detectStatementsInputFormat,
  parseStatementsInputFormat,
} from "../../util/statements/shared.js";
import { parseStatementInputsByFormat } from "../../util/statements/targets/parse-inputs.js";

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

/**
 * Format a date as UTC year/month/day path segments.
 */
function ymdUtc(date: Date): { yyyy: string; mm: string; dd: string } {
  const iso = date.toISOString().slice(0, 10);
  const [yyyy, mm, dd] = iso.split("-");
  return { yyyy, mm, dd };
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
       ON CONFLICT (identifier_fingerprint)
       DO UPDATE SET reference_identifier = EXCLUDED.reference_identifier`,
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
 * Read all UTF-8 content from stdin.
 */
async function readStdinUtf8(): Promise<string> {
  const chunks: Buffer[] = [];

  for await (const chunk of process.stdin) {
    if (typeof chunk === "string") {
      chunks.push(Buffer.from(chunk));
    } else {
      chunks.push(chunk);
    }
  }

  return Buffer.concat(chunks).toString("utf8");
}

/**
 * Build a statements batch and write it to `.fide/statements/YYYY/MM/DD/<root>.jsonl`.
 */
export async function runGraphAdd(argsOrFlags: string[] | Map<string, string | boolean>): Promise<number> {
  const parsed = argsOrFlags instanceof Map ? { positionals: [], flags: argsOrFlags } : parseArgs(argsOrFlags);
  const flags = parsed.flags;
  if (hasFlag(flags, "help") || hasFlag(flags, "-h")) {
    if (shouldUseJsonOutput(flags)) {
      printJson(COMMAND_SCHEMAS["graph.add"]);
    } else {
      console.log(graphCommandHelp());
    }
    return 0;
  }

  const graphTarget = resolveGraphTarget(flags);
  const inPath = getStringFlag(flags, "in");
  const useStdin = hasFlag(flags, "stdin");
  const formatFlag = parseStatementsInputFormat(getStringFlag(flags, "format"));
  const normalize = !hasFlag(flags, "no-normalize");
  const draftMode = hasFlag(flags, "draft");
  if (hasFlag(flags, "out")) {
    throw new Error("`graph add` no longer accepts --out. Output path is auto-generated.");
  }

  const stdinAvailable = process.stdin.isTTY === false;
  let statementInputs: StatementInput[] = [];
  const inlineParams = parsed.positionals.join(" ");
  /**
   * Agent-first precedence:
   * 1. --in <file>
   * 2. --stdin (explicit)
   * 3. inline params (positional JSON)
   * 4. Piped stdin (no flags, non-TTY stdin)
   */
  if (inPath) {
    const raw = await readUtf8(inPath);
    const format = formatFlag ?? detectStatementsInputFormat(raw);
    statementInputs = parseStatementInputsByFormat(raw, format);
  } else if (useStdin) {
    const raw = await readStdinUtf8();
    const format = formatFlag ?? detectStatementsInputFormat(raw);
    statementInputs = parseStatementInputsByFormat(raw, format);
  } else if (inlineParams && inlineParams.trim().length > 0) {
    statementInputs = parseStatementInputsByFormat(inlineParams, formatFlag ?? "json");
  } else {
    if (!stdinAvailable) {
      const raw = await readStdinUtf8();
      const format = formatFlag ?? detectStatementsInputFormat(raw);
      statementInputs = parseStatementInputsByFormat(raw, format);
    } else {
      console.error("Missing input for `graph add`. Use `--stdin`, `--in <path>`, or pass JSON inline.");
      console.error(graphCommandHelp());
      return 1;
    }
  }

  const batch = await buildStatementsWithRoot(statementInputs, { normalizeReferenceIdentifier: normalize });
  if (graphTarget.type === "postgres") {
    if (draftMode) {
      throw new Error("`--draft` is only supported for local graph targets.");
    }
    if (!graphTarget.databaseUrl) {
      throw new Error(
        `Missing postgres connection for graph target "${graphTarget.key ?? "unknown"}". Set FIDE_GRAPH_DATABASE_URL or configure the target in .fide/settings.json.`,
      );
    }

    process.env.DATABASE_URL = graphTarget.databaseUrl;
    const statementCount = graphTarget.schema === "public" && graphTarget.statementsTable === "statements"
      ? (await ingestStatements({ statements: batch.statements })).statementCount
      : await ingestStatementsToConfiguredTable(batch.statements, graphTarget.schema, graphTarget.statementsTable);
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

  const { root } = graphTarget;
  const outPath = (() => {
    const { yyyy, mm, dd } = ymdUtc(new Date());
    if (draftMode) {
      return resolve(root, ".fide", "statement-drafts", yyyy, mm, dd, `${batch.root}.md`);
    }
    return resolve(resolveStatementsDir(root), yyyy, mm, dd, `${batch.root}.jsonl`);
  })();

  let output: string;
  if (draftMode) {
    const normalizedInputs: StatementInput[] = batch.statements.map((statement) => ({
      subject: {
        referenceIdentifier: statement.subjectReferenceIdentifier,
        entityType: parseFideId(statement.subjectFideId).entityType,
        referenceType: parseFideId(statement.subjectFideId).referenceType,
      },
      predicate: {
        referenceIdentifier: statement.predicateReferenceIdentifier,
        entityType: "Concept",
        referenceType: "NetworkResource",
      },
      object: {
        referenceIdentifier: statement.objectReferenceIdentifier,
        entityType: parseFideId(statement.objectFideId).entityType,
        referenceType: parseFideId(statement.objectFideId).referenceType,
      },
    }));

    const baseDoc = statementDoc.v0.formatStatementInputsAsStatementDoc(normalizedInputs, {
      defaults: {
        subject: { referenceType: "NetworkResource" },
        object: { referenceType: "NetworkResource" },
      },
    });
    output = baseDoc.replace(/^---\n/, "---\ntype: fide-statements\nversion: v0\n");
  } else {
    const wires = batch.statements.map((statement) => ({
      s: statement.subjectFideId,
      sr: statement.subjectReferenceIdentifier,
      p: statement.predicateFideId,
      pr: statement.predicateReferenceIdentifier,
      o: statement.objectFideId,
      or: statement.objectReferenceIdentifier,
    }));
    output = `${wires.map((wire) => JSON.stringify(wire)).join("\n")}\n`;
  }

  await mkdir(resolve(outPath, ".."), { recursive: true });
  await writeUtf8(outPath, output);

  const payload = {
    root: batch.root,
    statementCount: batch.statements.length,
    mode: draftMode ? "draft" : "batch",
    outPath,
  };
  if (shouldUseJsonOutput(flags)) {
    printJson(applyFieldMask(payload, getStringFlag(flags, "fields")));
  } else {
    console.log(outPath);
  }
  return 0;
}
