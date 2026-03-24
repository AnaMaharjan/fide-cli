import { renderHelp } from "../../../util/help.js";

export function authKeysHelp(): string {
  return renderHelp({
    sections: [
      {
        title: "Usage",
        items: [
          "  fide keys <command> [flags]",
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
          "  fide keys list",
          "  fide keys create --label 'local agent' --dry-run",
          "  fide keys create --label 'workspace bot' --user-id user_<suffix>",
          "  fide keys revoke api_key_<suffix> --dry-run",
        ],
      },
    ],
  });
}
