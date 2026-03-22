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
          "  logout       Remove saved machine-level auth settings",
          "  status       Inspect machine-level auth settings and remote validity",
          "  whoami       Resolve the current authenticated user through the API",
          "  keys         List, create, and revoke API keys through the API",
        ],
      },
      {
        title: "Workflows",
        items: [
          "  fide auth login",
          "  fide auth login --web",
          "  fide auth login --agent-name 'Research Agent'",
          "  fide auth login --api-base-url http://localhost:3200 --api-key fide_sk_...",
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
          "  - Environment variables override saved settings: FIDE_API_BASE_URL and FIDE_API_KEY.",
          "  - If FIDE_API_BASE_URL is not set, the CLI falls back to https://api.fide.work.",
          "  - Machine-level auth settings live under ~/.fide/settings.json inside the env object.",
          "  - The same settings file can also store a selected workspace for cloud-mode commands.",
          "  - Workspace-level .fide settings are separate from the machine-level auth settings file.",
          "  - login defaults to browser-based agent auth.",
          "  - login --web explicitly starts browser-based agent auth.",
          "  - login verifies the API key through the API when --api-key is provided.",
          "  - Do not combine --web with --api-key.",
        ],
      },
    ],
  });
}
