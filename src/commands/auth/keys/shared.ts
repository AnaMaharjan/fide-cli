import { createAuthApiClient } from "../../../util/auth-api.js";
import { resolveAuthSettings } from "../../../util/auth-settings.js";

export async function requireAuthApiClient() {
  const auth = await resolveAuthSettings();
  if (!auth) {
    throw new Error("No Fide auth settings found. Run `fide auth login --api-base-url <url> --api-key <key>` or set FIDE_API_BASE_URL and FIDE_API_KEY.");
  }
  return {
    auth,
    client: createAuthApiClient(auth),
  };
}
