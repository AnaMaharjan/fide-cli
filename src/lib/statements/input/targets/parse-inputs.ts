import {
  parseJsonInputs,
  parseJsonlInputs,
  parseMdInputs,
  type StatementInput,
} from "@chris-test/graph";
import type { StatementsInputFormat } from "../shared.js";

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
  return parseMdInputs(raw, options);
}
