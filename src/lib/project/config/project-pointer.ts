import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { assertAccountId, assertWorkspaceId } from "../../../util/ids/public-ids.js";
import { resolveFideContext, resolveSettingsPath } from "./fide-dir.js";

export type ProjectPointerSettings = {
  path: string;
  root: string;
  accountId: string | null;
  workspaceId: string | null;
  accountName: string | null;
  workspaceName: string | null;
};

function normalizeString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

export function resolveProjectPointerSettings(root: string = process.cwd()): ProjectPointerSettings | null {
  const machineSettingsPath = resolve(homedir(), ".fide", "settings.json");
  const explicitSettingsPath = resolveSettingsPath(root);
  if (explicitSettingsPath !== machineSettingsPath && existsSync(explicitSettingsPath)) {
    const raw = readFileSync(explicitSettingsPath, "utf8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const account = parsed.account && typeof parsed.account === "object"
      ? parsed.account as Record<string, unknown>
      : null;
    const workspace = parsed.workspace && typeof parsed.workspace === "object"
      ? parsed.workspace as Record<string, unknown>
      : null;
    const context = resolveFideContext(root);
    return {
      path: explicitSettingsPath,
      root: context.root,
      accountId: normalizeString(account?.id ?? parsed.accountId),
      workspaceId: normalizeString(workspace?.id ?? parsed.workspaceId),
      accountName: normalizeString(account?.name),
      workspaceName: normalizeString(workspace?.name),
    };
  }

  let current = resolve(root);

  while (true) {
    const candidate = join(current, ".fide", "settings.json");
    if (candidate !== machineSettingsPath && existsSync(candidate)) {
      const raw = readFileSync(candidate, "utf8");
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const account = parsed.account && typeof parsed.account === "object"
        ? parsed.account as Record<string, unknown>
        : null;
      const workspace = parsed.workspace && typeof parsed.workspace === "object"
        ? parsed.workspace as Record<string, unknown>
        : null;
      return {
        path: candidate,
        root: current,
        accountId: normalizeString(account?.id ?? parsed.accountId),
        workspaceId: normalizeString(workspace?.id ?? parsed.workspaceId),
        accountName: normalizeString(account?.name),
        workspaceName: normalizeString(workspace?.name),
      };
    }

    if (existsSync(join(current, ".git"))) {
      return null;
    }

    const parent = dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}

export async function writeProjectPointerSettings(
  input: {
    root?: string;
    account?: { id: string; name?: string | null } | null;
    workspace?: { id: string; name?: string | null } | null;
  },
): Promise<string> {
  const root = input.root ? resolve(input.root) : process.cwd();
  const settings = resolveProjectPointerSettings(root);
  const targetRoot = settings?.root ?? resolve(root);
  const path = join(targetRoot, ".fide", "settings.json");
  const existing = settings
    ? JSON.parse(readFileSync(settings.path, "utf8")) as Record<string, unknown>
    : existsSync(path)
      ? JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>
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

  delete existing.apiBaseUrl;

  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(existing, null, 2)}\n`, "utf8");
  return path;
}
