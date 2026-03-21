import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { parseFideId, STANDARD_CURIE_PREFIXES, statementDoc, type StatementInput } from "@chris-test/graph";
import { getStringFlag, hasFlag, parseArgs, shouldUseJsonOutput } from "../../util/args.js";
import { printJson, readUtf8, writeUtf8 } from "../../util/io.js";
import { renderCommandHelp } from "../../util/command-metadata.js";
import { resolveGraphTarget } from "../../util/graph/target.js";
import { getLocalFideWarnings } from "../../util/graph/local-disk-warning.js";
import { graphDraftCommand } from "./metadata.js";
import { resolveStatementsBatch } from "./shared.js";

type DraftFrontmatter = {
  createdAtUTC: string;
  updatedAtUTC: string;
  writtenAtUTC: string;
  writtenRoot: string;
  updateCount: number;
  description: string | null;
};

function titleFromDraftName(name: string): string {
  return name
    .split(/[-_]+/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function parseExistingDraftFrontmatter(content: string): Partial<DraftFrontmatter> {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(content);
  if (!match) return {};
  const values: Partial<DraftFrontmatter> = {};
  for (const rawLine of match[1].split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    const separator = line.indexOf(":");
    if (separator === -1) continue;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    if (key === "createdAtUTC" && value) values.createdAtUTC = value;
    if (key === "updatedAtUTC" && value) values.updatedAtUTC = value;
    if (key === "writtenAtUTC" && value) values.writtenAtUTC = value;
    if (key === "writtenRoot" && value) values.writtenRoot = value;
    if (key === "description") values.description = value || null;
    if (key === "updateCount") {
      const parsed = Number.parseInt(value, 10);
      if (Number.isFinite(parsed)) values.updateCount = parsed;
    }
  }
  return values;
}

function renderDraftFrontmatter(params: {
  draftName: string;
  description: string | null;
  createdAtUTC: string;
  updatedAtUTC: string;
  writtenAtUTC: string | null;
  writtenRoot: string | null;
  updateCount: number;
}): string {
  const lines = [
    "---",
    "type: fide-statements",
    `title: ${titleFromDraftName(params.draftName)}`,
  ];
  if (params.description) {
    lines.push(`description: ${params.description}`);
  }
  lines.push("entityTypeHelp: fide graph defs");
  lines.push(`createdAtUTC: ${params.createdAtUTC}`);
  lines.push(`updatedAtUTC: ${params.updatedAtUTC}`);
  if (params.writtenAtUTC) {
    lines.push(`writtenAtUTC: ${params.writtenAtUTC}`);
  }
  if (params.writtenRoot) {
    lines.push(`writtenRoot: ${params.writtenRoot}`);
  }
  lines.push(`updateCount: ${params.updateCount}`);
  lines.push("defaults:");
  lines.push("  subject:");
  lines.push("    source: NetworkResource");
  lines.push("  object:");
  lines.push("    source: NetworkResource");
  lines.push("  predicate:");
  lines.push("    supported_curie_prefixes:");
  for (const prefix of Object.keys(STANDARD_CURIE_PREFIXES)) {
    lines.push(`      - ${prefix}`);
  }
  lines.push("---");
  return `${lines.join("\n")}\n`;
}

function draftHelp(): string {
  return renderCommandHelp(graphDraftCommand);
}

export async function runGraphDraft(args: string[]): Promise<number> {
  const initialParsed = parseArgs(args);
  if (hasFlag(initialParsed.flags, "help")) {
    console.log(draftHelp());
    return 0;
  }
  const { parsed, batch, statementInputs } = await resolveStatementsBatch(args);
  const flags = parsed.flags;
  const draftName = getStringFlag(flags, "name");
  const draftPath = getStringFlag(flags, "path");
  const descriptionFlag = getStringFlag(flags, "description");
  if (statementInputs.length === 0) {
    console.error("Missing input for `graph draft`. Use `--stdin`, `--file <path>`, or pass JSON inline.");
    console.error(draftHelp());
    return 1;
  }
  if (!draftName) {
    console.error("Missing required flag: --name <draft-name>.");
    console.error(draftHelp());
    return 1;
  }

  const graphTarget = resolveGraphTarget(flags);
  if (graphTarget.type !== "local") {
    throw new Error("`graph draft` is only supported for local .fide directories.");
  }

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

  const baseDoc = statementDoc.formatStatementInputsAsStatementDoc(normalizedInputs, {
    defaults: {
      subject: { referenceType: "NetworkResource" },
      object: { referenceType: "NetworkResource" },
      predicate: {
        supportedCuriePrefixes: Object.keys(STANDARD_CURIE_PREFIXES),
        prefixes: STANDARD_CURIE_PREFIXES,
      },
    },
  });

  const outPath = draftPath
    ? resolve(graphTarget.root, ".fide", "drafts", "statements", draftPath, `${draftName}.md`)
    : resolve(graphTarget.root, ".fide", "drafts", "statements", `${draftName}.md`);
  let existingFrontmatter: Partial<DraftFrontmatter> = {};
  try {
    existingFrontmatter = parseExistingDraftFrontmatter(await readUtf8(outPath));
  } catch {
    existingFrontmatter = {};
  }
  const now = new Date().toISOString();
  const createdAtUTC = existingFrontmatter.createdAtUTC ?? now;
  const updatedAtUTC = now;
  const updateCount =
    existingFrontmatter.createdAtUTC && typeof existingFrontmatter.updateCount === "number"
      ? existingFrontmatter.updateCount + 1
      : 0;
  const description = descriptionFlag ?? existingFrontmatter.description ?? null;
  const frontmatter = renderDraftFrontmatter({
    draftName,
    description,
    createdAtUTC,
    updatedAtUTC,
    writtenAtUTC: existingFrontmatter.writtenAtUTC ?? null,
    writtenRoot: existingFrontmatter.writtenRoot ?? null,
    updateCount,
  });
  const output = baseDoc.replace(/^---\n[\s\S]*?\n---\n/, frontmatter);
  await mkdir(resolve(outPath, ".."), { recursive: true });
  await writeUtf8(outPath, output);

  const payload = {
    name: draftName,
    root: batch.root,
    statementCount: batch.statements.length,
    mode: "draft",
    outPath,
    createdAtUTC,
    updatedAtUTC,
    updateCount,
    next: {
      write: `fide graph write --file ${outPath}`,
    },
    warnings: getLocalFideWarnings(graphTarget.root, { gitignore: graphTarget.gitignore }),
  };
  if (shouldUseJsonOutput(flags)) {
    printJson(payload);
  } else {
    console.log(outPath);
  }
  return 0;
}
