import { renderHelp } from "../../../util/help.js";

export function authKeysHelp(): string {
  return renderHelp({
    sections: [
      {
        title: "Usage",
        items: [
          "  fide auth keys <command> [flags]",
        ],
      },
      {
        title: "Commands",
        items: [
          "  list         List API keys visible to the current authenticated user",
          "  create       Create an API key",
          "  revoke       Revoke an API key by id",
        ],
      },
      {
        title: "Workflows",
        items: [
          "  fide auth keys list",
          "  fide auth keys create --label 'local agent'",
          "  fide auth keys create --label 'workspace bot' --user-id <service-account-user-id>",
          "  fide auth keys revoke <id>",
        ],
      },
    ],
  });
}
