import { extname } from "node:path";
import { getStringFlag } from "../../args.js";

export type StatementsInputFormat = "json" | "jsonl" | "fsd";

/**
 * Parse optional `--format` flag into a supported statements input format.
 */
export function parseStatementsInputFormat(value: string | null): StatementsInputFormat | null {
  if (!value) return null;
  if (value === "json" || value === "jsonl" || value === "fsd") return value;
  throw new Error(`Invalid --format value: ${value}. Expected one of: json, jsonl, fsd.`);
}

/**
 * Auto-detect statements input format from payload shape.
 */
export function detectStatementsInputFormat(raw: string): StatementsInputFormat {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error("Input payload is empty.");

  if (trimmed.startsWith("---")) return "fsd";
  if (/^\[\s*[{"]/.test(trimmed)) return "json";
  if (/^\[\s*[A-Za-z][\w-]*\s*:/.test(trimmed)) return "fsd";

  const lines = trimmed
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));

  if (lines.length > 0 && lines.every((line) => line.startsWith("{"))) {
    return "jsonl";
  }

  throw new Error("Ambiguous input format. Pass --format <json|jsonl|fsd>.");
}

/**
 * Infer statements input format from a file extension when possible.
 */
export function detectStatementsInputFormatFromFilePath(filePath: string): StatementsInputFormat | null {
  const extension = extname(filePath).toLowerCase();
  if (extension === ".json") return "json";
  if (extension === ".jsonl") return "jsonl";
  if (extension === ".fsd" || extension === ".md" || extension === ".mdx") return "fsd";
  return null;
}

/**
 * Resolve required `--file` flag for commands that require a file input path.
 */
export function getRequiredBatchInputPath(flags: Map<string, string | boolean>): string | null {
  const filePath = getStringFlag(flags, "file");
  if (!filePath) {
    console.error("Missing required flag: --file <input>");
    return null;
  }
  return filePath;
}
