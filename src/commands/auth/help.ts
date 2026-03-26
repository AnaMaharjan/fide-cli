import { renderHelp } from "../../util/command/help.js";

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
          "  logout       Remove saved auth for an account",
          "  whoami       Show the current authenticated user",
        ],
      },
      {
        title: "Workflows",
        items: [
          "  fide auth login",
          "  fide login",
          "  fide login --agent-name 'Research Agent'",
          "  fide login --api-base-url http://localhost:3200",
          "  fide status",
          "  fide whoami",
        ],
      },
      {
        title: "Notes",
        items: [
          "  - Environment variables override stored account auth: FIDE_API_BASE_URL, FIDE_SYNC_BASE_URL, FIDE_ACCESS_TOKEN, and FIDE_ACCOUNT_ID.",
          "  - If FIDE_SYNC_BASE_URL is set, `fide start` uses it without needing --sync-url.",
          "  - Machine auth lives under ~/.fide/accounts/<account_id>/settings.json.",
          "  - Commands resolve auth from FIDE_ACCOUNT_ID or project .fide/settings.json.",
          "  - Project .fide/settings.json stores account and workspace context, but never stores secrets.",
          "  - Workspace targeting resolves from --workspace, FIDE_WORKSPACE_ID, or project .fide/settings.json.",
          "  - Use `fide status` for full auth, project, and workspace status.",
        ],
      },
    ],
  });
}
