import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { assertAccountId, assertWorkspaceId } from "../../../util/ids/public-ids.js";
import { resolveFideContext, resolveFideDir } from "./fide-dir.js";

export type ProjectPointerSettings = {
  path: string;
  root: string;
  accountId: string | null;
  workspaceId: string | null;
  daemonId: string | null;
  accountName: string | null;
  workspaceName: string | null;
  daemonName: string | null;
};

function normalizeString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

export function resolveProjectPointerSettings(
  root: string = process.cwd(),
): ProjectPointerSettings | null {
  const fideDir = resolveFideDir(root);
  const metaPath = resolve(fideDir, "_meta.json");
  if (!existsSync(metaPath)) {
    return null;
  }
  const raw = readFileSync(metaPath, "utf8");
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  const account =
    parsed.account && typeof parsed.account === "object"
      ? (parsed.account as Record<string, unknown>)
      : null;
  const workspace =
    parsed.workspace && typeof parsed.workspace === "object"
      ? (parsed.workspace as Record<string, unknown>)
      : null;
  const daemon =
    parsed.daemon && typeof parsed.daemon === "object"
      ? (parsed.daemon as Record<string, unknown>)
      : null;
  const context = resolveFideContext(root);
  return {
    path: metaPath,
    root: context.root,
    accountId: normalizeString(account?.id ?? parsed.accountId),
    workspaceId: normalizeString(workspace?.id ?? parsed.workspaceId),
    daemonId: normalizeString(daemon?.id ?? parsed.daemonId),
    accountName: normalizeString(account?.name),
    workspaceName: normalizeString(workspace?.name),
    daemonName: normalizeString(daemon?.name),
  };
}

export async function writeProjectPointerSettings(
  input: {
    root?: string;
    account?: { id: string; name?: string | null } | null;
    workspace?: { id: string; name?: string | null } | null;
    daemon?: { id: string; name?: string | null } | null;
  },
): Promise<string> {
  const root = input.root ? resolve(input.root) : process.cwd();
  const fideDir = resolveFideDir(root);
  const path = resolve(fideDir, "_meta.json");
  const existing = existsSync(path)
    ? (JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>)
    : {};

  if (input.account) {
    existing.account = {
      id: assertAccountId(input.account.id),
      ...(normalizeString(input.account.name) ? { name: normalizeString(input.account.name) } : {}),
    };
  }

  if (input.workspace) {
    existing.workspace = {
      id: assertWorkspaceId(input.workspace.id),
      ...(normalizeString(input.workspace.name) ? { name: normalizeString(input.workspace.name) } : {}),
    };
  }

  if (input.daemon) {
    existing.daemon = {
      id: input.daemon.id,
      ...(normalizeString(input.daemon.name) ? { name: normalizeString(input.daemon.name) } : {}),
    };
  }

  delete existing.apiBaseUrl;

  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(existing, null, 2)}\n`, "utf8");
  return path;
}
