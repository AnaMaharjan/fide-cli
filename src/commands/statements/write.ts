import { mkdir, readdir, rm } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";
import { parseMd } from "@chris-test/graph";
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
import { listStatementsDayMetaPaths } from "../../lib/graph/etl/extract/statementsDayMeta.js";
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
    `fide statements write '{"statements":[...]}'`,
    "fide statements write --file <inputs> [--replace-draft] [--format <json|jsonl|md>]",
    "fide statements write --stdin [--format <json|jsonl|md>]",
  ],
  paramOrder: ["file", "stdin", "replace-draft", "format", "no-normalize", "pretty"],
  params: {
    file: { kind: "string", description: "Read statement inputs from a file", valueLabel: "<inputs>" },
    stdin: { kind: "boolean", description: "Read statement inputs from stdin" },
    "replace-draft": {
      kind: "boolean",
      description: "When writing from a draft file, remove the previously written root for that draft",
    },
    format: { kind: "string", enum: ["json", "jsonl", "md"], description: "Force input format" },
    "no-normalize": { kind: "boolean", description: "Disable reference identifier normalization" },
    pretty: { kind: "boolean", shorthand: "-p", description: "Human-readable output" },
  },
  notes: [
    "Writes JSONL batches under .fide/statements/YYYY/MM/DD/<root>.jsonl.",
    "JSON inputs (inline, `--file *.json`, or `--format json`) must be one object with a `statements` array; bare top-level arrays are rejected.",
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

type StatementsDayMetaEntry = {
  committedAtUTC?: string;
  /** Legacy key in older `_meta.json`; treated as first-commit time when present. */
  writtenAtUTC?: string;
  statementCount: number;
  sourceDraftPath?: string;
  sourceDraftTitle?: string;
  /** From draft frontmatter `description:` when writing with `--file`. */
  sourceDraftDescription?: string;
  /**
   * Root hash(es) to purge on the next `fide statements load --replace-roots` after `--replace-draft`.
   * May be a single string or a list when several prior batches shared the same `sourceDraftPath`.
   */
  sourceDraftRootPendingReplacement?: string | string[] | null;
};

type StatementsDayMeta = Record<string, StatementsDayMetaEntry>;

type DraftWriteMetadata = {
  title?: string;
  description?: string;
  writtenRoot?: string;
};

function toProjectRelativePath(projectRoot: string, filePath: string): string | null {
  const relativePath = relative(projectRoot, filePath);
  if (!relativePath || relativePath.startsWith(`..${sep}`) || relativePath === "..") {
    return null;
  }
  return relativePath.split(sep).join("/");
}

function resolveSourceDraftRootPendingReplacement(
  input: string | string[] | null | undefined,
  prev: string | string[] | null | undefined,
): string | string[] | null | undefined {
  if (Array.isArray(input)) {
    return input.length > 0 ? input : undefined;
  }
  if (typeof input === "string") {
    return input;
  }
  if (input === null) {
    return prev;
  }
  return prev;
}

async function updateStatementsDayMeta(
  metaPath: string,
  input: {
    root: string;
    committedAtUTC: string;
    statementCount: number;
    sourceDraftPath?: string;
    sourceDraftTitle?: string;
    sourceDraftDescription?: string;
    /** Superseded root hash(es) when replacing; omit to keep prior value. `null` does not clear. */
    sourceDraftRootPendingReplacement?: string | string[] | null;
  },
): Promise<void> {
  let meta: StatementsDayMeta = {};
  try {
    meta = JSON.parse(await readUtf8(metaPath)) as StatementsDayMeta;
  } catch {
    meta = {};
  }
  const prev = meta[input.root];
  const priorCommitTime =
    typeof prev?.committedAtUTC === "string" && prev.committedAtUTC.length > 0
      ? prev.committedAtUTC
      : typeof prev?.writtenAtUTC === "string" && prev.writtenAtUTC.length > 0
        ? prev.writtenAtUTC
        : undefined;
  const committedAtUTC = priorCommitTime ?? input.committedAtUTC;

  const pendingReplacement = resolveSourceDraftRootPendingReplacement(
    input.sourceDraftRootPendingReplacement,
    prev?.sourceDraftRootPendingReplacement,
  );

  meta[input.root] = {
    committedAtUTC,
    statementCount: input.statementCount,
    ...(input.sourceDraftPath ? { sourceDraftPath: input.sourceDraftPath } : {}),
    ...(input.sourceDraftTitle ? { sourceDraftTitle: input.sourceDraftTitle } : {}),
    ...(input.sourceDraftDescription ? { sourceDraftDescription: input.sourceDraftDescription } : {}),
    ...(pendingReplacement !== undefined
      ? { sourceDraftRootPendingReplacement: pendingReplacement }
      : {}),
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

    const descriptionMatch = line.match(/^description:\s*(.*)$/);
    if (descriptionMatch) {
      let value = descriptionMatch[1].trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (value.length > 0) {
        metadata.description = value;
      }
      continue;
    }

    const writtenRootMatch = line.match(/^writtenRoot:\s*(.+?)\s*$/);
    if (writtenRootMatch) {
      metadata.writtenRoot = writtenRootMatch[1].trim();
    }
  }
  return metadata;
}

/** Every `_meta.json` root for the same draft file (plus `previousWrittenRoot`) so load can purge the full chain. */
async function collectSupersededRootHashesForDraftPath(
  statementsDir: string,
  sourceDraftPath: string,
  newRoot: string,
  previousWrittenRoot: string | undefined,
): Promise<string[]> {
  const set = new Set<string>();
  if (previousWrittenRoot && previousWrittenRoot !== newRoot) {
    set.add(previousWrittenRoot);
  }
  for (const metaPath of await listStatementsDayMetaPaths(statementsDir)) {
    let meta: StatementsDayMeta;
    try {
      meta = JSON.parse(await readUtf8(metaPath)) as StatementsDayMeta;
    } catch {
      continue;
    }
    for (const [rootKey, entry] of Object.entries(meta)) {
      if (rootKey === newRoot) continue;
      if (entry?.sourceDraftPath !== sourceDraftPath) continue;
      set.add(rootKey);
    }
  }
  return [...set];
}

/** Find `.fide/statements/.../<rootHash>.jsonl` for replace-draft cleanup when the draft no longer stores a write timestamp. */
async function findBatchFileByRoot(statementsDir: string, root: string): Promise<string | null> {
  const targetName = `${root}.jsonl`;

  async function walk(dir: string): Promise<string | null> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = resolve(dir, entry.name);
      if (entry.isDirectory()) {
        const found = await walk(full);
        if (found) return found;
      } else if (entry.isFile() && entry.name === targetName) {
        return full;
      }
    }
    return null;
  }

  return walk(statementsDir);
}

/**
 * After `fide statements write`, refresh `writtenRoot`.
 * Bump `updatedAtUTC` only when the canonical root changed (including first time `writtenRoot` is set).
 */
function updateDraftWriteFrontmatter(
  content: string,
  writtenRoot: string,
  bumpUpdatedAt: boolean,
  updatedAtUTCWhenBumping: string,
): string {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(content);
  if (!match) return content;
  const lines = match[1].split("\n");
  const nextLines: string[] = [];
  let hadUpdatedAt = false;

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (trimmed.startsWith("writtenAtUTC:") || trimmed.startsWith("writtenRoot:")) {
      continue;
    }
    if (trimmed.startsWith("updatedAtUTC:")) {
      hadUpdatedAt = true;
      if (bumpUpdatedAt) {
        nextLines.push(`updatedAtUTC: ${updatedAtUTCWhenBumping}`);
      } else {
        nextLines.push(rawLine);
      }
      continue;
    }
    nextLines.push(rawLine);
  }

  if (!hadUpdatedAt && bumpUpdatedAt) {
    const createdIdx = nextLines.findIndex((line) => line.trim().startsWith("createdAtUTC:"));
    if (createdIdx >= 0) {
      nextLines.splice(createdIdx + 1, 0, `updatedAtUTC: ${updatedAtUTCWhenBumping}`);
    } else {
      nextLines.unshift(`updatedAtUTC: ${updatedAtUTCWhenBumping}`);
    }
  }

  const updatedIdx = nextLines.findIndex((line) => line.trim().startsWith("updatedAtUTC:"));
  if (updatedIdx >= 0) {
    nextLines.splice(updatedIdx + 1, 0, `writtenRoot: ${writtenRoot}`);
  } else {
    nextLines.push(`writtenRoot: ${writtenRoot}`);
  }

  return content.replace(/^---\n[\s\S]*?\n---\n/, `---\n${nextLines.join("\n")}\n---\n`);
}

function formatDeclaredEntityRecord(params: {
  name: string;
  description: string;
  updatedAtUTC: string;
  referenceIdentifier: string;
}): string {
  return [
    "---",
    "type: fide-declared-entity",
    `title: ${params.name}`,
    `description: ${params.description}`,
    `updatedAtUTC: ${params.updatedAtUTC}`,
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
  updatedAtUTC: string,
): Promise<void> {
  const raw = await readUtf8(filePath);
  const parsed = parseMd(raw);
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
      updatedAtUTC,
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
  let sourceDraftDescription: string | undefined;
  let previousWrittenRoot: string | undefined;
  if (filePath) {
    try {
      const draftMetadata = extractDraftWriteMetadata(await readUtf8(filePath));
      sourceDraftTitle = draftMetadata.title ?? undefined;
      sourceDraftDescription = draftMetadata.description ?? undefined;
      previousWrittenRoot = draftMetadata.writtenRoot;
    } catch {
      sourceDraftTitle = undefined;
      sourceDraftDescription = undefined;
      previousWrittenRoot = undefined;
    }
  }

  const statementsDir = resolveStatementsDir(graphTarget.root);
  const { yyyy, mm, dd } = ymdUtc(new Date());
  const outPath = resolve(statementsDir, yyyy, mm, dd, `${batch.root}.jsonl`);
  const committedAtUTC = new Date().toISOString();
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
    await materializeDeclaredEntityRecords(graphTarget.root, filePath, committedAtUTC);
  }
  await mkdir(resolve(outPath, ".."), { recursive: true });
  await writeUtf8(outPath, output);
  const sourceDraftRelPath = filePath
    ? toProjectRelativePath(graphTarget.root, filePath) ?? undefined
    : undefined;

  let supersededRoots: string[] = [];
  if (hasFlag(flags, "replace-draft") && sourceDraftRelPath) {
    supersededRoots = await collectSupersededRootHashesForDraftPath(
      statementsDir,
      sourceDraftRelPath,
      batch.root,
      previousWrittenRoot,
    );
  }

  const pendingReplacementArg: string | string[] | undefined =
    supersededRoots.length === 0
      ? undefined
      : supersededRoots.length === 1
        ? supersededRoots[0]!
        : supersededRoots;

  await updateStatementsDayMeta(metaPath, {
    root: batch.root,
    committedAtUTC,
    statementCount: batch.statements.length,
    ...(filePath
      ? {
          sourceDraftPath: sourceDraftRelPath,
          sourceDraftTitle,
          sourceDraftDescription,
        }
      : {}),
    ...(pendingReplacementArg !== undefined ? { sourceDraftRootPendingReplacement: pendingReplacementArg } : {}),
  });
  for (const supersededRoot of supersededRoots) {
    const previousOutPath = await findBatchFileByRoot(statementsDir, supersededRoot);
    if (previousOutPath) {
      await rm(previousOutPath, { force: true });
      const previousMetaPath = resolve(previousOutPath, "..", "_meta.json");
      await removeStatementsDayMetaEntry(previousMetaPath, supersededRoot);
    }
  }

  if (filePath) {
    try {
      const raw = await readUtf8(filePath);
      const bumpUpdatedAt = previousWrittenRoot !== batch.root;
      const nextDraft = updateDraftWriteFrontmatter(raw, batch.root, bumpUpdatedAt, committedAtUTC);
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
