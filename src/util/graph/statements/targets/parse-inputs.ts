import type { StatementInput } from "@chris-test/graph";
import type { StatementsInputFormat } from "../shared.js";
import { parseJsonInputs } from "./input-json.js";
import { parseJsonlInputs } from "./input-jsonl.js";
import { parseStatementDocInputs } from "./input-statement-doc.js";

/**
 * Parse raw input into `StatementInput[]` using the resolved format.
 */
export function parseStatementInputsByFormat(raw: string, format: StatementsInputFormat): StatementInput[] {
  if (format === "json") return parseJsonInputs(raw);
  if (format === "jsonl") return parseJsonlInputs(raw);
  return parseStatementDocInputs(raw);
}
