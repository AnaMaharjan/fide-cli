import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { ensureFideEnvLoaded } from "../../lib/project/config/fide-dir.js";
import { resolveProjectPointerSettings } from "../../lib/project/config/project-pointer.js";
import { assertAccountId } from "../ids/public-ids.js";

export type AccountSelectionSource = "env" | "project";

export type StoredAccountSettings = {
  accessToken?: string;
};

export type ResolvedAccountSelection = {
  accountId: string;
  source: AccountSelectionSource;
  path: string;
};

function normalizeAccountId(value: unknown): string | null {
  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }
  return assertAccountId(value.trim());
}

export function resolveFideConfigDir(): string {
  return join(homedir(), ".fide");
}

export function resolveAccountsDir(): string {
  return join(resolveFideConfigDir(), "accounts");
}

export function resolveAccountDir(accountId: string): string {
  return join(resolveAccountsDir(), assertAccountId(accountId));
}

export function resolveAccountSettingsPath(accountId: string): string {
  return join(resolveAccountDir(accountId), "settings.json");
}


export async function readStoredAccountSettings(accountId: string): Promise<StoredAccountSettings | null> {
  try {
    const raw = await readFile(resolveAccountSettingsPath(accountId), "utf8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const accessToken = typeof parsed.accessToken === "string" && parsed.accessToken.trim().length > 0
      ? parsed.accessToken.trim()
      : null;
    return {
      ...(accessToken ? { accessToken } : {}),
    };
  } catch {
    return null;
  }
}

export async function writeStoredAccountSettings(accountId: string, settings: StoredAccountSettings): Promise<void> {
  const normalizedAccountId = assertAccountId(accountId);
  const next: StoredAccountSettings = {};
  if (typeof settings.accessToken === "string" && settings.accessToken.trim().length > 0) {
    next.accessToken = settings.accessToken.trim();
  }

  const path = resolveAccountSettingsPath(normalizedAccountId);
  if (Object.keys(next).length === 0) {
    await rm(path, { force: true });
    return;
  }

  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(next, null, 2)}\n`, "utf8");
}

export async function resolveSelectedAccount(
  _flags: Map<string, string | boolean>,
  root: string = process.cwd(),
): Promise<ResolvedAccountSelection | null> {
  ensureFideEnvLoaded();

  const envAccountId = normalizeAccountId(process.env.FIDE_ACCOUNT_ID);
  if (envAccountId) {
    return {
      accountId: envAccountId,
      source: "env",
      path: "env",
    };
  }

  const projectPointer = resolveProjectPointerSettings(root);
  if (projectPointer?.accountId) {
    return {
      accountId: projectPointer.accountId,
      source: "project",
      path: projectPointer.path,
    };
  }

  return null;
}

export async function clearStoredAccountSettings(accountId: string): Promise<void> {
  await rm(resolveAccountSettingsPath(assertAccountId(accountId)), { force: true });
}

export async function ensureAccountSettingsPathPermissions(accountId: string): Promise<void> {
  await chmod(resolveAccountSettingsPath(accountId), 0o600);
}

export function getAccountNotFoundError(accountId: string): Error {
  return new Error(`Account "${assertAccountId(accountId)}" not found. Run \`fide login\`.`);
}
