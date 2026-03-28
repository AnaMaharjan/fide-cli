import type { StatementInput } from "@chris-test/graph";
import type { StatementsInputFormat } from "../shared.js";
import { parseJsonInputs } from "./input-json.js";
import { parseJsonlInputs } from "./input-jsonl.js";
import { parseStatementDocInputs } from "./input-statement-doc.js";

type ParseStatementInputsByFormatOptions = {
  filePath?: string;
  normalizeReferenceIdentifier?: boolean;
};

/**
 * Parse raw input into `StatementInput[]` using the resolved format.
 */
export async function parseStatementInputsByFormat(
  raw: string,
  format: StatementsInputFormat,
  options: ParseStatementInputsByFormatOptions = {},
): Promise<StatementInput[]> {
  if (format === "json") return parseJsonInputs(raw);
  if (format === "jsonl") return parseJsonlInputs(raw);
  return parseStatementDocInputs(raw, options);
}
