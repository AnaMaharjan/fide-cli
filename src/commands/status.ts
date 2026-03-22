import { existsSync } from "node:fs";
import type { FideSettings } from "@chris-test/graph";
import { parseArgs, shouldUseJsonOutput } from "../util/args.js";
import { renderCommandHelp } from "../util/command-metadata.js";
import { createAuthApiClient } from "../util/auth-api.js";
import { readStoredAuthSettings, resolveAuthSettings } from "../util/auth-settings.js";
import { printJson } from "../util/io.js";
import { formatPretty } from "../util/pretty.js";
import { okResponse } from "../util/response.js";
import { statusCommand } from "./metadata.js";
import { readJsonFile, resolveFideContext, resolveSettingsPath } from "../util/fide-dir.js";
import { resolveWorkspaceSelection } from "../util/workspace-settings.js";
import { resolveProfileAuthPath, resolveProfileSelection, resolveProfileSettingsPath } from "../util/profile-settings.js";

export async function runStatusCommand(args: string[]): Promise<number> {
  const { flags } = parseArgs(args);
  const useJson = shouldUseJsonOutput(flags);
  if (flags.has("help") || flags.has("-h")) {
    console.log(renderCommandHelp(statusCommand));
    return 0;
  }

  const profileSelection = await resolveProfileSelection(flags);
  const storedAuth = profileSelection ? await readStoredAuthSettings(profileSelection.profile) : null;
  let resolvedAuth = null;
  let authResolutionError: string | null = null;
  try {
    resolvedAuth = await resolveAuthSettings(flags);
  } catch (error) {
    authResolutionError = error instanceof Error ? error.message : String(error);
  }
  let remote: { ok: boolean; error?: string } = { ok: false, error: "Not authenticated" };
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

  const payload = okResponse("status.v1", {
    machine: {
      configPath: profileSelection ? resolveProfileAuthPath(profileSelection.profile) : null,
      profile: profileSelection?.profile ?? null,
      authConfigured: Boolean(resolvedAuth),
      authSource: resolvedAuth?.source ?? null,
      baseUrl: resolvedAuth?.baseUrl ?? null,
      storedSettingsPresent: Boolean(storedAuth),
      envAuthConfigured: Boolean(process.env.FIDE_API_BASE_URL?.trim() && process.env.FIDE_API_KEY?.trim()),
      authValid: remote.ok,
      authResolutionError,
      authResolutionHint: !resolvedAuth
        ? "A default profile is optional. Use --profile <name>, FIDE_PROFILE, project .fide/settings.json, or run `fide login --profile <name>`."
        : null,
      authError: remote.ok ? null : (remote.error ?? null),
    },
    project: {
      cwd: process.cwd(),
      root: fide.root,
      fideDir: fide.fideDir,
      source: fide.source,
      settingsPath,
      settingsPresent: existsSync(settingsPath),
      graphCount: Object.keys(projectSettings?.graphs ?? {}).length,
      queryCatalogCount: Object.keys(projectSettings?.queryCatalogs ?? {}).length,
    },
    workspace: {
      settingsPath: profileSelection ? resolveProfileSettingsPath(profileSelection.profile) : null,
      selected: workspaceSelection?.workspaceId ?? null,
      source: workspaceSelection?.source ?? null,
    },
  }, {
    command: "fide status",
  });

  if (useJson) {
    printJson(payload);
  } else {
    if (!resolvedAuth && !authResolutionError) {
      console.log("No Fide auth profile resolved. A default profile is optional.");
      console.log("Use --profile <name>, FIDE_PROFILE, project .fide/settings.json, or run `fide login --profile <name>`.");
      console.log("");
    }
    console.log(formatPretty("status.v1", payload) ?? JSON.stringify(payload, null, 2));
  }
  return 0;
}
