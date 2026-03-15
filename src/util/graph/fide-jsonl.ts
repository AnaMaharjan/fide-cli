import { existsSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import { parseFideId, parseGraphStatementBatchJsonl } from "@chris-test/graph";
import type { ResolvedStatementRow } from "./sqlite.js";

type FideJsonlInspection = {
  reachable: boolean;
  initialized: boolean;
  missing: string[];
  error?: string;
  fileCount?: number;
};

async function listJsonlFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listJsonlFiles(fullPath));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".jsonl")) {
      files.push(fullPath);
    }
  }
  return files.sort();
}

export async function inspectFideJsonlStore(dir: string): Promise<FideJsonlInspection> {
  if (!existsSync(dir)) {
    return {
      reachable: false,
      initialized: false,
      missing: [dir],
    };
  }

  try {
    const files = await listJsonlFiles(dir);
    return {
      reachable: true,
      initialized: true,
      missing: [],
      fileCount: files.length,
    };
  } catch (error) {
    return {
      reachable: false,
      initialized: false,
      missing: [dir],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function queryFideJsonlResolvedStatements(dir: string): Promise<ResolvedStatementRow[]> {
  const files = await listJsonlFiles(dir);
  const rows: ResolvedStatementRow[] = [];

  for (const file of files) {
    const raw = await readFile(file, "utf8");
    const parsed = await parseGraphStatementBatchJsonl(raw);
    const fileStat = await stat(file);
    const createdAt = fileStat.mtime.toISOString();

    for (const statement of parsed.statements) {
      if (!statement.statementFideId) {
        throw new Error(`Invalid graph statement batch: missing statementFideId in ${relative(process.cwd(), file)}`);
      }
      const subject = parseFideId(statement.subjectFideId);
      const predicate = parseFideId(statement.predicateFideId);
      const object = parseFideId(statement.objectFideId);
      const statementId = parseFideId(statement.statementFideId);

      rows.push({
        statement_fingerprint: statementId.fingerprint,
        subject_type: subject.typeChar,
        subject_reference_type: subject.referenceChar,
        subject_fingerprint: subject.fingerprint,
        predicate_fingerprint: predicate.fingerprint,
        object_type: object.typeChar,
        object_reference_type: object.referenceChar,
        object_fingerprint: object.fingerprint,
        created_at: createdAt,
        subject_reference_identifier: statement.subjectReferenceIdentifier,
        predicate_reference_identifier: statement.predicateReferenceIdentifier,
        object_reference_identifier: statement.objectReferenceIdentifier,
      });
    }
  }

  return rows;
}
