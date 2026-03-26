import { defineCommand } from "../../util/command/command-metadata.js";

/** Router-only surface for `fide query` (no concrete flags). */
export const queryGroupCommand = defineCommand({
  surface: "query",
  command: "fide query",
  summary: "Query local project data and saved query definitions",
  usage: ["fide query <command> [flags]"],
  params: {},
  paramOrder: [],
});
