import { createAuthApiClient } from "../../../util/auth/auth-api.js";
import { resolveAuthSettings } from "../../../util/auth/auth-settings.js";

export async function requireAuthApiClient(flags: Map<string, string | boolean> = new Map()) {
  const auth = await resolveAuthSettings(flags);
  if (!auth) {
    throw new Error("No Fide auth account resolved. Set FIDE_ACCOUNT_ID, set project .fide/settings.json with account.id, or run `fide login`.");
  }
  return {
    auth,
    client: createAuthApiClient(auth),
  };
}
