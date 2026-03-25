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
          "  fide login --agent-name 'Research Agent'",
          "  fide login --profile work --api-base-url http://localhost:3200",
          "  fide status",
          "  fide whoami",
        ],
      },
      {
        title: "Notes",
        items: [
          "  - Environment variables override stored profile auth: FIDE_API_BASE_URL, FIDE_ACCESS_TOKEN, and FIDE_PROFILE.",
          "  - If FIDE_API_BASE_URL is not set, the CLI falls back to https://api.fide.work.",
          "  - Machine auth and workspace context live under ~/.fide/profiles/<name>/settings.json.",
          "  - The default profile lives in ~/.fide/config.json.",
          "  - A default profile is optional. Commands can also resolve from --profile, FIDE_PROFILE, or project .fide/settings.json.",
          "  - Project .fide/settings.json may point to a profile and workspace for context, but never stores secrets.",
          "  - Workspace targeting resolves from --workspace, FIDE_WORKSPACE_ID, project .fide/settings.json, or the selected profile's settings.json.",
          "  - Use `fide status` for full auth, project, and workspace status.",
          "  - Use `fide login --profile <name> --set-default` to set a default profile intentionally.",
          "  - Use `fide login --clear-default` to unset the saved default profile.",
        ],
      },
    ],
  });
}
