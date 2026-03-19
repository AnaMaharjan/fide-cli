import { renderHelp } from "../../util/help.js";

export function authCommandHelp(): string {
  return renderHelp({
    sections: [
      {
        title: "Usage",
        items: [
          "  fide auth <command> [flags]",
        ],
      },
      {
        title: "Commands",
        items: [
          "  login        Save API-key-based auth for the CLI",
          "  logout       Remove saved local auth state",
          "  status       Inspect the current auth configuration and remote validity",
          "  whoami       Resolve the current authenticated user through the API",
          "  keys         List, create, and revoke API keys through the API",
        ],
      },
      {
        title: "Workflows",
        items: [
          "  fide auth login --base-url http://localhost:3200 --api-key fide_sk_...",
          "  fide auth status",
          "  fide auth whoami",
          "  fide auth keys list",
          "  fide auth keys create --label 'local agent'",
          "  fide auth keys revoke <id>",
        ],
      },
      {
        title: "Notes",
        items: [
          "  - Environment variables override saved config: FIDE_BASE_URL and FIDE_API_KEY.",
          "  - If FIDE_BASE_URL is not set, the CLI falls back to https://api.fide.work.",
          "  - Saved auth config lives under ~/.fide/settings.json inside the env object.",
          "  - This initial auth surface is API-key based; browser login can be added later.",
        ],
      },
    ],
  });
}
