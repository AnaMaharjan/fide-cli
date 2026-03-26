import { renderHelp } from "../../util/command/help.js";

export function pluginCommandHelp(): string {
  return renderHelp({
    sections: [
      {
        title: "Usage",
        items: [
          "  fide plugin <command> [flags]",
        ],
      },
      {
        title: "Commands",
        items: [
          "  install               Install a Fide plugin from a repo, URL, or local path",
        ],
      },
      {
        title: "Workflows",
        items: [
          "  fide plugin install owner/repo",
          "  fide plugin install https://github.com/owner/repo.git",
          "  fide plugin install ./local-plugin",
        ],
      },
      {
        title: "Notes",
        items: [
          "  - Plugins are intended for optional capabilities such as graph backends, query packs, and format translators.",
          "  - `plugin install` is scaffolded now; plugin download and registration behavior is not implemented yet.",
        ],
      },
    ],
  });
}
