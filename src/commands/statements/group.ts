import { defineCommand } from "../../util/command/command-metadata.js";

/** Router-only surface for `fide statements`. */
export const statementsGroupCommand = defineCommand({
  surface: "statements",
  command: "fide statements",
  summary: "Author local statement batches and drafts",
  usage: ["fide statements <command> [flags]"],
  params: {},
  paramOrder: [],
});
