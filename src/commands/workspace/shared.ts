import { resolveWorkspaceSelectionOrThrow } from "../../util/workspace-settings.js";
import { createAuthApiClient } from "../../util/auth-api.js";
import { resolveAuthSettings } from "../../util/auth-settings.js";

export async function requireWorkspaceApiClient(flags: Map<string, string | boolean> = new Map()) {
  const auth = await resolveAuthSettings(flags);
  if (!auth) {
    throw new Error("No Fide auth profile resolved. A default profile is optional. Pass --profile <name>, set FIDE_PROFILE, use project .fide/settings.json, or run `fide login --profile <name>`.");
  }
  return {
    auth,
    client: createAuthApiClient(auth),
  };
}

export async function requireHostedWorkspaceTarget(flags: Map<string, string | boolean> = new Map()) {
  return resolveWorkspaceSelectionOrThrow(flags);
}
