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
          "  login        Save auth for this machine",
          "  logout       Remove saved auth for a profile",
          "  whoami       Show the current authenticated user",
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
          "  fide status",
          "  fide whoami",
          "  fide keys list",
          "  fide keys create --label 'local agent'",
          "  fide keys revoke <id>",
        ],
      },
      {
        title: "Notes",
        items: [
          "  - Environment variables override stored profile auth: FIDE_API_BASE_URL, FIDE_API_KEY, and FIDE_PROFILE.",
          "  - If FIDE_API_BASE_URL is not set, the CLI falls back to https://api.fide.work.",
          "  - Machine auth lives under ~/.fide/profiles/<name>/auth.json.",
          "  - Stored profile workspace context lives under ~/.fide/profiles/<name>/settings.json.",
          "  - The default profile lives in ~/.fide/config.json.",
          "  - A default profile is optional. Commands can also resolve from --profile, FIDE_PROFILE, or project .fide/settings.json.",
          "  - Project .fide/settings.json may point to a profile and workspace for context, but never stores secrets.",
          "  - Hosted command targeting comes from `--workspace` or `FIDE_WORKSPACE_ID`, not from stored workspace context.",
          "  - Use `fide status` for full auth, project, and workspace status.",
          "  - Use `fide login --profile <name> --set-default` to set a default profile intentionally.",
          "  - Use `fide login --clear-default` to unset the saved default profile.",
          "  - Do not combine --web with --api-key.",
        ],
      },
    ],
  });
}
