import { createAuthApiClient } from "../../util/auth-api.js";
import { resolveAuthConfig } from "../../util/auth-config.js";

export async function requireWorkspaceApiClient() {
  const auth = await resolveAuthConfig();
  if (!auth) {
    throw new Error("No Fide auth settings found. Run `fide auth login --base-url <url> --api-key <key>` or set FIDE_BASE_URL and FIDE_API_KEY.");
  }
  return {
    auth,
    client: createAuthApiClient(auth),
  };
}
