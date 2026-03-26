import { defineCommand } from "../../util/command/command-metadata.js";

export const workspaceGroupCommand = defineCommand({
  surface: "workspace",
  command: "fide workspace",
  summary: "Workspace info",
  usage: ["fide workspace <command> [flags]"],
  params: {},
  paramOrder: [],
  notes: [
    "Use `workspace` for shared hosted workspace inspection.",
    "Use `fide workspace list` to see accessible workspaces.",
    "Use `fide workspace get` to inspect the workspace bound in the current project.",
  ],
});
