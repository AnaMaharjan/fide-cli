import { defineCommand } from "../../util/command/command-metadata.js";

/** Router-only surface for `fide graph`. */
export const graphGroupCommand = defineCommand({
  surface: "graph",
  command: "fide graph",
  summary: "Local graph work and hosted graph projection",
  usage: ["fide graph <command> [flags]"],
  params: {},
  paramOrder: [],
});
