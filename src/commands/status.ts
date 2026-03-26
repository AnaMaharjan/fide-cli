import { existsSync } from "node:fs";
import type { FideSettings } from "@chris-test/graph";
import { parseArgs, shouldUseJsonOutput } from "../util/command/args.js";
import { renderCommandHelp } from "../util/command/command-metadata.js";
import { createAuthApiClient } from "../util/auth/auth-api.js";
import { readStoredAuthSettings, resolveAuthSettings } from "../util/auth/auth-settings.js";
import { printJson } from "../util/command/io.js";
import { formatPretty } from "../util/command/pretty.js";
import { okResponse } from "../util/command/response.js";
import { statusCommand } from "./metadata.js";
import { readJsonFile, resolveFideContext, resolveSettingsPath } from "../util/project/fide-dir.js";
import { resolveWorkspaceSelection } from "../util/workspace/workspace-settings.js";
import { resolveSelectedAccount, resolveAccountSettingsPath } from "../util/auth/account-settings.js";
import { readLiveSyncSession } from "../util/workspace/sync-session.js";

function omitNullFields<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => omitNullFields(item)) as T;
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entry]) => entry !== null)
        .map(([key, entry]) => [key, omitNullFields(entry)]),
    ) as T;
  }
  return value;
}

export async function runStatusCommand(args: string[]): Promise<number> {
  const { flags } = parseArgs(args);
  const useJson = shouldUseJsonOutput(flags);
  if (flags.has("help") || flags.has("-h")) {
    console.log(renderCommandHelp(statusCommand));
    return 0;
  }

  const accountSelection = await resolveSelectedAccount(flags);
  const storedAuth = accountSelection ? await readStoredAuthSettings(accountSelection.accountId) : null;
  let resolvedAuth = null;
  let authResolutionError: string | null = null;
  try {
    resolvedAuth = await resolveAuthSettings(flags);
  } catch (error) {
    authResolutionError = error instanceof Error ? error.message : String(error);
  }
  const missingAccountHint = "No Fide auth account selected. Set FIDE_ACCOUNT_ID, set project .fide/settings.json with account.id, or run `fide login`.";
  let remote: { ok: boolean; error?: string | null } = { ok: false, error: null };
  if (resolvedAuth) {
    try {
      await createAuthApiClient(resolvedAuth).me();
      remote = { ok: true };
    } catch (error) {
      remote = { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  const fide = resolveFideContext(process.cwd());
  const settingsPath = resolveSettingsPath(process.cwd());
  const projectSettings = readJsonFile<FideSettings>(settingsPath);
  const workspaceSelection = await resolveWorkspaceSelection(flags);
  const syncSession = await readLiveSyncSession();
  const projectSettingsRecord = projectSettings as Record<string, unknown> | null;
  const envApiBaseUrl = process.env.FIDE_API_BASE_URL?.trim() || null;
  const envSyncBaseUrl = process.env.FIDE_SYNC_BASE_URL?.trim() || null;
  const envWorkspaceId = process.env.FIDE_WORKSPACE_ID?.trim() || null;
  const envWorkspaceUrl = process.env.FIDE_WORKSPACE_URL?.trim() || null;
  const envAccountId = process.env.FIDE_ACCOUNT_ID?.trim() || null;
  const projectAccount = projectSettingsRecord?.account && typeof projectSettingsRecord.account === "object"
    ? projectSettingsRecord.account as Record<string, unknown>
    : null;
  const projectWorkspace = projectSettingsRecord?.workspace && typeof projectSettingsRecord.workspace === "object"
    ? projectSettingsRecord.workspace as Record<string, unknown>
    : null;
  const projectAccountId = typeof (projectAccount?.id ?? projectSettingsRecord?.accountId) === "string"
    ? String(projectAccount?.id ?? projectSettingsRecord?.accountId)
    : null;
  const projectWorkspaceId = typeof (projectWorkspace?.id ?? projectSettingsRecord?.workspaceId) === "string"
    ? String(projectWorkspace?.id ?? projectSettingsRecord?.workspaceId)
    : null;

  const payload = okResponse("status.v1", {
    machine: {
      configPath: accountSelection ? resolveAccountSettingsPath(accountSelection.accountId) : null,
      accountId: accountSelection?.accountId ?? null,
      authConfigured: Boolean(resolvedAuth),
      authSource: resolvedAuth?.source ?? null,
      baseUrl: resolvedAuth?.baseUrl ?? null,
      storedSettingsPresent: Boolean(storedAuth),
      envAuthConfigured: Boolean(process.env.FIDE_API_BASE_URL?.trim() && process.env.FIDE_ACCESS_TOKEN?.trim()),
      env_defaults: omitNullFields({
        FIDE_ACCOUNT_ID: envAccountId,
        FIDE_API_BASE_URL: envApiBaseUrl,
        FIDE_SYNC_BASE_URL: envSyncBaseUrl,
        FIDE_WORKSPACE_ID: envWorkspaceId,
        FIDE_WORKSPACE_URL: envWorkspaceUrl,
      }),
      authValid: remote.ok,
      authResolutionError,
      authResolutionHint: !resolvedAuth
        ? missingAccountHint
        : null,
      authError: resolvedAuth ? (remote.ok ? null : (remote.error ?? null)) : null,
    },
    project: {
      cwd: process.cwd(),
      root: fide.root,
      fideDir: fide.fideDir,
      source: fide.source,
      settingsPath,
      settingsPresent: existsSync(settingsPath),
      graphCount: Object.keys(projectSettings?.graphs ?? {}).length,
      settings: omitNullFields({
        account: projectAccountId ? {
          id: projectAccountId,
          ...(typeof projectAccount?.name === "string" ? { name: projectAccount.name } : {}),
        } : null,
        workspace: projectWorkspaceId ? {
          id: projectWorkspaceId,
          ...(typeof projectWorkspace?.name === "string" ? { name: projectWorkspace.name } : {}),
        } : null,
      }),
    },
    workspace: {
      settingsPath: accountSelection ? resolveAccountSettingsPath(accountSelection.accountId) : null,
      selected: workspaceSelection?.workspaceId ?? null,
      source: workspaceSelection?.source ?? null,
    },
    sync: syncSession
      ? {
          pid: syncSession.pid,
          status: syncSession.status,
          syncBaseUrl: syncSession.syncBaseUrl,
          syncEndpoint: syncSession.syncEndpoint ?? null,
          projectFideRoots: syncSession.projectFideRoots ?? [],
          startedAt: syncSession.startedAt,
          stoppedAt: syncSession.stoppedAt ?? null,
          error: syncSession.error ?? null,
        }
      : null,
  }, {
    command: "fide status",
  });

  if (useJson) {
    printJson(omitNullFields(payload));
  } else {
    if (!resolvedAuth && !authResolutionError) {
      console.log("No Fide auth account selected.");
      console.log("Use FIDE_ACCOUNT_ID, project .fide/settings.json with account.id, or run `fide login`.");
      console.log("");
    }
    console.log(formatPretty("status.v1", payload) ?? JSON.stringify(payload, null, 2));
  }
  return 0;
}
