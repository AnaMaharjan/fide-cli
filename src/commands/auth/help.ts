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
          "  login        Save auth for the CLI via API key or browser handoff",
          "  logout       Remove saved auth for a profile",
          "  status       Inspect resolved auth profile settings and remote validity",
          "  whoami       Resolve the current authenticated user through the API",
          "  keys         List, create, and revoke API keys through the API",
        ],
      },
      {
        title: "Workflows",
        items: [
          "  fide auth login",
          "  fide login --profile work",
          "  fide login --profile work --set-default",
          "  fide login --clear-default",
          "  fide login --web",
          "  fide login --agent-name 'Research Agent'",
          "  fide login --profile work --api-base-url http://localhost:3200 --api-key fide_sk_...",
          "  fide auth status",
          "  fide whoami",
          "  fide auth keys list",
          "  fide auth keys create --label 'local agent'",
          "  fide auth keys revoke <id>",
        ],
      },
      {
        title: "Notes",
        items: [
          "  - Environment variables override stored profile auth: FIDE_API_BASE_URL, FIDE_API_KEY, and FIDE_PROFILE.",
          "  - If FIDE_API_BASE_URL is not set, the CLI falls back to https://api.fide.work.",
          "  - Machine auth lives under ~/.fide/profiles/<name>/auth.json.",
          "  - Profile workspace defaults live under ~/.fide/profiles/<name>/settings.json.",
          "  - The default profile lives in ~/.fide/config.json.",
          "  - A default profile is optional. Commands can also resolve from --profile, FIDE_PROFILE, or project .fide/settings.json.",
          "  - Project .fide/settings.json may point to a profile and workspace, but never stores secrets.",
          "  - Use `fide login --profile <name> --set-default` to set a default profile intentionally.",
          "  - Use `fide login --clear-default` to unset the saved default profile.",
          "  - login defaults to browser-based agent auth.",
          "  - login --web explicitly starts browser-based agent auth.",
          "  - login verifies the API key through the API when --api-key is provided.",
          "  - Do not combine --web with --api-key.",
        ],
      },
    ],
  });
}
