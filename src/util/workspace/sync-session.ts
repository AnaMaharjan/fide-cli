import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { resolveFideConfigDir } from "../auth/account-settings.js";

export type SyncSessionState = "starting" | "connected" | "attached" | "error" | "stopped";

export type StoredSyncSession = {
  pid: number;
  startedAt: string;
  syncBaseUrl: string;
  syncEndpoint?: string | null;
  projectFideRoots?: string[];
  status: SyncSessionState;
  error?: string | null;
  stoppedAt?: string | null;
};

export function resolveSyncDir(): string {
  return join(resolveFideConfigDir(), "sync");
}

export function resolveMachineStatePath(): string {
  return join(resolveSyncDir(), "state.json");
}

function resolveLegacySyncSessionPath(): string {
  return join(resolveSyncDir(), "session.json");
}

export function resolveSyncSessionPath(): string {
  return resolveMachineStatePath();
}

export async function readSyncSession(): Promise<StoredSyncSession | null> {
  try {
    const raw = await readFile(resolveSyncSessionPath(), "utf8");
    return JSON.parse(raw) as StoredSyncSession;
  } catch {
    try {
      const raw = await readFile(resolveLegacySyncSessionPath(), "utf8");
      return JSON.parse(raw) as StoredSyncSession;
    } catch {
      return null;
    }
  }
}

export async function writeSyncSession(session: StoredSyncSession): Promise<void> {
  await mkdir(resolveFideConfigDir(), { recursive: true });
  await writeFile(resolveSyncSessionPath(), `${JSON.stringify(session, null, 2)}\n`, "utf8");
}

export async function updateSyncSession(
  update: Partial<StoredSyncSession> & Pick<StoredSyncSession, "pid">,
): Promise<StoredSyncSession | null> {
  const current = await readSyncSession();
  if (!current || current.pid !== update.pid) {
    return null;
  }
  const next = { ...current, ...update };
  await writeSyncSession(next);
  return next;
}

export async function clearSyncSession(): Promise<void> {
  await rm(resolveSyncSessionPath(), { force: true });
  await rm(resolveLegacySyncSessionPath(), { force: true });
}

export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export async function readLiveSyncSession(): Promise<StoredSyncSession | null> {
  const session = await readSyncSession();
  if (!session) return null;
  if (isProcessAlive(session.pid)) return session;
  return {
    ...session,
    status: "stopped",
    stoppedAt: session.stoppedAt ?? new Date().toISOString(),
  };
}

export function syncSessionExists(): boolean {
  return existsSync(resolveSyncSessionPath());
}
