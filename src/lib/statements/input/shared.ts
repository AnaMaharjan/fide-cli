import { extname } from "node:path";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export type StatementsInputFormat = "json" | "jsonl" | "md";

/**
 * Parse optional `--format` flag into a supported statements input format.
 */
export function parseStatementsInputFormat(value: string | null): StatementsInputFormat | null {
  if (!value) return null;
  if (value === "json" || value === "jsonl" || value === "md") return value;
  throw new Error(`Invalid --format value: ${value}. Expected one of: json, jsonl, md.`);
}

/**
 * Auto-detect statements input format from payload shape.
 */
export function detectStatementsInputFormat(raw: string): StatementsInputFormat {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error("Input payload is empty.");

  if (trimmed.startsWith("---")) return "md";
  if (/^\[\s*[{"]/.test(trimmed)) return "json";
  if (trimmed.startsWith("{")) {
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (isRecord(parsed) && Array.isArray(parsed.statements)) {
        return "json";
      }
    } catch {
      /* fall through */
    }
  }
  if (/^\[\s*[A-Za-z][\w-]*\s*:/.test(trimmed)) return "md";

  const lines = trimmed
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));

  if (lines.length > 0 && lines.every((line) => line.startsWith("{"))) {
    return "jsonl";
  }

  throw new Error("Ambiguous input format. Pass --format <json|jsonl|md>.");
}

/**
 * Infer statements input format from a file extension when possible.
 */
export function detectStatementsInputFormatFromFilePath(filePath: string): StatementsInputFormat | null {
  const extension = extname(filePath).toLowerCase();
  if (extension === ".json") return "json";
  if (extension === ".jsonl") return "jsonl";
  if (extension === ".md" || extension === ".mdx") return "md";
  return null;
}
