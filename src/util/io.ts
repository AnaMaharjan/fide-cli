import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

/**
 * Read a UTF-8 file path relative to current working directory.
 */
export async function readUtf8(path: string): Promise<string> {
  return readFile(resolve(process.cwd(), path), "utf8");
}

/**
 * Write UTF-8 content and create parent directories when needed.
 */
export async function writeUtf8(path: string, content: string): Promise<void> {
  const absPath = resolve(process.cwd(), path);
  await mkdir(dirname(absPath), { recursive: true });
  await writeFile(absPath, content, "utf8");
}

/**
 * Append UTF-8 content and create parent directories when needed.
 */
export async function appendUtf8(path: string, content: string): Promise<void> {
  const absPath = resolve(process.cwd(), path);
  await mkdir(dirname(absPath), { recursive: true });
  await appendFile(absPath, content, "utf8");
}

/**
 * Print pretty JSON to stdout.
 */
export function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

/**
 * Apply a comma-separated field mask to an object.
 * Agent DX: limits response size to protect context window.
 */
export function applyFieldMask<T extends Record<string, unknown>>(obj: T, mask: string | null): Partial<T> {
  if (!mask || !mask.trim()) return obj;
  const keys = new Set(mask.split(",").map((k) => k.trim()).filter(Boolean));
  if (keys.size === 0) return obj;
  const out: Partial<T> = {};
  for (const k of keys) {
    if (k in obj) out[k as keyof T] = obj[k as keyof T];
  }
  return out;
}
