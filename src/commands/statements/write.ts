import { mkdir, rm } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";
import { statementDoc } from "@chris-test/graph";
import { getLocalFideWarnings } from "../../lib/project/warnings/local-warnings.js";
import { getStringFlag, hasFlag, parseArgs, shouldUseJsonOutput } from "../../util/command/args.js";
import {
  booleanKeysFromCommand,
  defineCommand,
  mergeBooleanKeySets,
  renderCommandHelp,
} from "../../util/command/command-metadata.js";
import { printJson, readUtf8, writeUtf8 } from "../../util/command/io.js";
import { ymdUtc } from "../../lib/project/path-date.js";
import { formatPretty } from "../../util/command/pretty.js";
import { resolveLocalStatementsBatchOrExit } from "./shared.js";
import { readJsonFile } from "../../lib/project/config/fide-dir.js";

type WorkspaceSettings = {
  workspace?: {
    public_base_url?: string;
  };
};

export const statementsWriteCommand = defineCommand({
  surface: "statements.write",
  command: "fide statements write",
  outputType: "StatementsWriteOutput",
  summary: "Write canonical statement batches into a local project",
  usage: [
    "fide statements write <json>",
    "fide statements write --file <inputs> [--replace-draft] [--format <json|jsonl|fsd>]",
    "fide statements write --stdin [--format <json|jsonl|fsd>]",
  ],
  paramOrder: ["file", "stdin", "replace-draft", "format", "no-normalize", "pretty"],
  params: {
    file: { kind: "string", description: "Read statement inputs from a file", valueLabel: "<inputs>" },
    stdin: { kind: "boolean", description: "Read statement inputs from stdin" },
    "replace-draft": {
      kind: "boolean",
      description: "When writing from a draft file, remove the previously written root for that draft",
    },
    format: { kind: "string", enum: ["json", "jsonl", "fsd"], description: "Force input format" },
    "no-normalize": { kind: "boolean", description: "Disable reference identifier normalization" },
    pretty: { kind: "boolean", shorthand: "-p", description: "Human-readable output" },
  },
  notes: [
    "Writes JSONL batches under .fide/statements/YYYY/MM/DD/<root>.jsonl.",
    "Use `fide statements guide` to inspect statement-shape guidance and allowed entity types while preparing inputs.",
  ],
});

const STATEMENTS_WRITE_PARSE_KEYS = mergeBooleanKeySets(booleanKeysFromCommand(statementsWriteCommand));

export type StatementsWriteOutput = {
  root: string;
  statementCount: number;
  mode: "local";
  outPath: string;
  warnings: string[];
};

function resolveStatementsDir(root: string): string {
  return resolve(root, ".fide", "statements");
}

function resolveDeclaredEntitiesDir(root: string): string {
  return resolve(root, ".fide", "records", "declared-entities");
}

type StatementsDayMeta = Record<string, {
  writtenAtUTC: string;
  statementCount: number;
  sourceDraftPath?: string;
  sourceDraftTitle?: string;
}>;

type DraftWriteMetadata = {
  title?: string;
  writtenAtUTC?: string;
  writtenRoot?: string;
};

function toProjectRelativePath(projectRoot: string, filePath: string): string | null {
  const relativePath = relative(projectRoot, filePath);
  if (!relativePath || relativePath.startsWith(`..${sep}`) || relativePath === "..") {
    return null;
  }
  return relativePath.split(sep).join("/");
}

async function updateStatementsDayMeta(
  metaPath: string,
  input: {
    root: string;
    writtenAtUTC: string;
    statementCount: number;
    sourceDraftPath?: string;
    sourceDraftTitle?: string;
  },
): Promise<void> {
  let meta: StatementsDayMeta = {};
  try {
    meta = JSON.parse(await readUtf8(metaPath)) as StatementsDayMeta;
  } catch {
    meta = {};
  }
  meta[input.root] = {
    writtenAtUTC: input.writtenAtUTC,
    statementCount: input.statementCount,
    ...(input.sourceDraftPath ? { sourceDraftPath: input.sourceDraftPath } : {}),
    ...(input.sourceDraftTitle ? { sourceDraftTitle: input.sourceDraftTitle } : {}),
  };
  await writeUtf8(metaPath, `${JSON.stringify(meta, null, 2)}\n`);
}

async function removeStatementsDayMetaEntry(metaPath: string, root: string): Promise<void> {
  let meta: StatementsDayMeta = {};
  try {
    meta = JSON.parse(await readUtf8(metaPath)) as StatementsDayMeta;
  } catch {
    return;
  }
  if (!(root in meta)) return;
  delete meta[root];
  await writeUtf8(metaPath, `${JSON.stringify(meta, null, 2)}\n`);
}

function extractDraftWriteMetadata(content: string): DraftWriteMetadata {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(content);
  if (!match) return {};
  const metadata: DraftWriteMetadata = {};
  for (const line of match[1].split("\n")) {
    const titleMatch = line.match(/^title:\s*(.+?)\s*$/);
    if (titleMatch) {
      const value = titleMatch[1].trim();
      metadata.title = (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      )
        ? value.slice(1, -1)
        : value;
      continue;
    }

    const writtenAtMatch = line.match(/^writtenAtUTC:\s*(.+?)\s*$/);
    if (writtenAtMatch) {
      metadata.writtenAtUTC = writtenAtMatch[1].trim();
      continue;
    }

    const writtenRootMatch = line.match(/^writtenRoot:\s*(.+?)\s*$/);
    if (writtenRootMatch) {
      metadata.writtenRoot = writtenRootMatch[1].trim();
    }
  }
  return metadata;
}

function resolveStatementsOutPath(statementsDir: string, writtenAtUTC: string, root: string): string | null {
  const date = new Date(writtenAtUTC);
  if (Number.isNaN(date.valueOf())) return null;
  const { yyyy, mm, dd } = ymdUtc(date);
  return resolve(statementsDir, yyyy, mm, dd, `${root}.jsonl`);
}

function updateDraftWriteFrontmatter(content: string, writtenAtUTC: string, writtenRoot: string): string {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(content);
  if (!match) return content;
  const lines = match[1].split("\n");
  const nextLines: string[] = [];
  let inserted = false;

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (trimmed.startsWith("writtenAtUTC:") || trimmed.startsWith("writtenRoot:")) {
      continue;
    }
    nextLines.push(rawLine);
    if (trimmed.startsWith("updatedAtUTC:")) {
      nextLines.push(`writtenAtUTC: ${writtenAtUTC}`);
      nextLines.push(`writtenRoot: ${writtenRoot}`);
      inserted = true;
    }
  }

  if (!inserted) {
    const updateCountIndex = nextLines.findIndex((line) => line.trim().startsWith("updateCount:"));
    if (updateCountIndex >= 0) {
      nextLines.splice(updateCountIndex, 0, `writtenAtUTC: ${writtenAtUTC}`, `writtenRoot: ${writtenRoot}`);
    } else {
      nextLines.push(`writtenAtUTC: ${writtenAtUTC}`);
      nextLines.push(`writtenRoot: ${writtenRoot}`);
    }
  }

  return content.replace(/^---\n[\s\S]*?\n---\n/, `---\n${nextLines.join("\n")}\n---\n`);
}

function formatDeclaredEntityRecord(params: {
  name: string;
  description: string;
  writtenAtUTC: string;
  referenceIdentifier: string;
}): string {
  return [
    "---",
    "type: fide-declared-entity",
    `title: ${params.name}`,
    `description: ${params.description}`,
    `writtenAtUTC: ${params.writtenAtUTC}`,
    `referenceIdentifier: ${params.referenceIdentifier}`,
    "---",
    "",
    `# ${params.name}`,
    "",
    params.description,
    "",
  ].join("\n");
}

function resolveDeclaredEntityLocalPath(
  projectRoot: string,
  publicBaseUrl: string,
  referenceIdentifier: string,
): string {
  let base: URL;
  let ref: URL;
  try {
    base = new URL(publicBaseUrl);
    ref = new URL(referenceIdentifier);
  } catch {
    throw new Error(`Declared entity reference must be a valid URL: ${referenceIdentifier}`);
  }

  if (base.origin !== ref.origin) {
    throw new Error(
      `Declared entity reference ${referenceIdentifier} does not match workspace public_base_url origin ${publicBaseUrl}.`,
    );
  }

  const basePath = base.pathname.replace(/\/+$/u, "");
  const refPath = ref.pathname;
  if (!refPath.startsWith(`${basePath}/`)) {
    throw new Error(
      `Declared entity reference ${referenceIdentifier} is not under workspace public_base_url ${publicBaseUrl}.`,
    );
  }

  const relativePublicPath = refPath.slice(basePath.length);
  if (!relativePublicPath.startsWith("/.fide/records/declared-entities/")) {
    throw new Error(
      `Declared entity reference ${referenceIdentifier} must live under /.fide/records/declared-entities/.`,
    );
  }

  return resolve(projectRoot, `.${relativePublicPath}`);
}

async function materializeDeclaredEntityRecords(
  projectRoot: string,
  filePath: string,
  writtenAtUTC: string,
): Promise<void> {
  const raw = await readUtf8(filePath);
  const parsed = statementDoc.parseStatementDoc(raw);
  const entityDeclarations = parsed.entityDeclarations;
  if (!entityDeclarations || Object.keys(entityDeclarations).length === 0) return;

  const settings = readJsonFile<WorkspaceSettings>(resolve(projectRoot, ".fide", "settings.json"));
  const publicBaseUrl = settings?.workspace?.public_base_url;
  if (!publicBaseUrl) {
    throw new Error(
      "Draft includes entity_declarations, but workspace .fide/settings.json is missing workspace.public_base_url.",
    );
  }

  const referenceIdentifiers = parsed.referenceIdentifiers ?? {};
  await mkdir(resolveDeclaredEntitiesDir(projectRoot), { recursive: true });

  for (const [alias, declaration] of Object.entries(entityDeclarations)) {
    const referenceIdentifier = referenceIdentifiers[alias];
    if (!referenceIdentifier) {
      throw new Error(`entity_declarations.${alias} requires a matching reference_identifiers.${alias}.`);
    }

    const localPath = resolveDeclaredEntityLocalPath(projectRoot, publicBaseUrl, referenceIdentifier);
    const content = formatDeclaredEntityRecord({
      name: declaration.name,
      description: declaration.description,
      writtenAtUTC,
      referenceIdentifier,
    });

    let existing: string | null = null;
    try {
      existing = await readUtf8(localPath);
    } catch {
      existing = null;
    }

    if (existing === null || existing !== content) {
      await mkdir(resolve(localPath, ".."), { recursive: true });
      await writeUtf8(localPath, content);
    }
  }
}

export async function runStatementsWrite(argsOrFlags: string[] | Map<string, string | boolean>): Promise<number> {
  const initialParsed = argsOrFlags instanceof Map
    ? { positionals: [], flags: argsOrFlags }
    : parseArgs(argsOrFlags, { booleanKeys: STATEMENTS_WRITE_PARSE_KEYS });
  if (hasFlag(initialParsed.flags, "help")) {
    console.log(renderCommandHelp(statementsWriteCommand));
    return 0;
  }
  if (hasFlag(initialParsed.flags, "draft")) {
    throw new Error("`statements write` does not support `--draft`. Use `fide statements draft`.");
  }
  if (hasFlag(initialParsed.flags, "query")) {
    throw new Error("`statements write` no longer supports `--query`. Use `fide query save`.");
  }
  const resolved = await resolveLocalStatementsBatchOrExit(argsOrFlags, statementsWriteCommand);
  if (!resolved) {
    return 0;
  }
  const { flags, batch, graphTarget } = resolved;
  if (hasFlag(flags, "out")) {
    throw new Error("`statements write` does not accept --out. Output path is auto-generated.");
  }
  const filePath = getStringFlag(flags, "file");
  if (hasFlag(flags, "replace-draft") && !filePath) {
    throw new Error("`statements write --replace-draft` requires `--file <draft.md>`.");
  }
  let sourceDraftTitle: string | undefined;
  let previousWrittenAtUTC: string | undefined;
  let previousWrittenRoot: string | undefined;
  if (filePath) {
    try {
      const draftMetadata = extractDraftWriteMetadata(await readUtf8(filePath));
      sourceDraftTitle = draftMetadata.title ?? undefined;
      previousWrittenAtUTC = draftMetadata.writtenAtUTC;
      previousWrittenRoot = draftMetadata.writtenRoot;
    } catch {
      sourceDraftTitle = undefined;
      previousWrittenAtUTC = undefined;
      previousWrittenRoot = undefined;
    }
  }

  const statementsDir = resolveStatementsDir(graphTarget.root);
  const { yyyy, mm, dd } = ymdUtc(new Date());
  const outPath = resolve(statementsDir, yyyy, mm, dd, `${batch.root}.jsonl`);
  const writtenAtUTC = new Date().toISOString();
  const metaPath = resolve(statementsDir, yyyy, mm, dd, "_meta.json");
  const wires = batch.statements.map((statement) => ({
    s: statement.subjectFideId,
    sr: statement.subjectReferenceIdentifier,
    p: statement.predicateFideId,
    pr: statement.predicateReferenceIdentifier,
    o: statement.objectFideId,
    or: statement.objectReferenceIdentifier,
  }));
  const output = `${wires.map((wire) => JSON.stringify(wire)).join("\n")}\n`;
  if (filePath) {
    await materializeDeclaredEntityRecords(graphTarget.root, filePath, writtenAtUTC);
  }
  await mkdir(resolve(outPath, ".."), { recursive: true });
  await writeUtf8(outPath, output);
  await updateStatementsDayMeta(metaPath, {
    root: batch.root,
    writtenAtUTC,
    statementCount: batch.statements.length,
    ...(filePath
      ? {
          sourceDraftPath: toProjectRelativePath(graphTarget.root, filePath) ?? undefined,
          sourceDraftTitle,
        }
      : {}),
  });
  if (
    hasFlag(flags, "replace-draft") &&
    previousWrittenRoot &&
    previousWrittenAtUTC &&
    previousWrittenRoot !== batch.root
  ) {
    const previousOutPath = resolveStatementsOutPath(
      statementsDir,
      previousWrittenAtUTC,
      previousWrittenRoot,
    );
    if (previousOutPath) {
      await rm(previousOutPath, { force: true });
      const previousMetaPath = resolve(previousOutPath, "..", "_meta.json");
      await removeStatementsDayMetaEntry(previousMetaPath, previousWrittenRoot);
    }
  }

  if (filePath) {
    try {
      const raw = await readUtf8(filePath);
      const nextDraft = updateDraftWriteFrontmatter(raw, writtenAtUTC, batch.root);
      if (nextDraft !== raw) {
        await writeUtf8(filePath, nextDraft);
      }
    } catch {
      // Ignore non-draft file inputs; local canonical write already succeeded.
    }
  }

  const payload = {
    root: batch.root,
    statementCount: batch.statements.length,
    mode: "local",
    outPath,
    warnings: getLocalFideWarnings(graphTarget.root, { gitignore: graphTarget.gitignore }),
  };
  if (shouldUseJsonOutput(flags)) {
    printJson(payload);
  } else {
    console.log(formatPretty("statements-write-local.v1", payload));
  }
  return 0;
}
