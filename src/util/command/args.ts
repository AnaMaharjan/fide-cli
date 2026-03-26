export type ParsedArgs = {
  positionals: string[];
  flags: Map<string, string | boolean>;
};

export type ParseArgsOptions = {
  /** Flag names that consume no value when `--key` appears without `=` and no following token. */
  booleanKeys?: ReadonlySet<string>;
};

const SHORT_FLAG_ALIASES: Record<string, string> = {
  h: "help",
  p: "pretty",
};

/**
 * Parse CLI tokens into positional args and `--flag` values.
 * Supports `--key value`, `--key=value`, short aliases like `-p`, and boolean flags.
 */
export function parseArgs(args: string[], options?: ParseArgsOptions): ParsedArgs {
  const positionals: string[] = [];
  const flags = new Map<string, string | boolean>();
  const booleanKeys = options?.booleanKeys ?? null;

  for (let i = 0; i < args.length; i += 1) {
    const token = args[i];

    if (token.startsWith("-") && !token.startsWith("--") && token.length === 2) {
      const alias = SHORT_FLAG_ALIASES[token.slice(1)];
      if (alias) {
        flags.set(alias, true);
        continue;
      }
    }

    if (!token.startsWith("--")) {
      positionals.push(token);
      continue;
    }

    const keyValue = token.slice(2);
    const eqIndex = keyValue.indexOf("=");
    if (eqIndex >= 0) {
      const key = keyValue.slice(0, eqIndex);
      const value = keyValue.slice(eqIndex + 1);
      flags.set(key, value);
      continue;
    }

    const key = keyValue;
    if (booleanKeys?.has(key)) {
      flags.set(key, true);
      continue;
    }

    const next = args[i + 1];
    if (!next || next.startsWith("--")) {
      flags.set(key, true);
      continue;
    }

    flags.set(key, next);
    i += 1;
  }

  return { positionals, flags };
}

/**
 * Read a flag value only when the parsed value is a string.
 */
export function getStringFlag(
  flags: Map<string, string | boolean>,
  key: string,
): string | null {
  const value = flags.get(key);
  if (typeof value === "string") return value;
  return null;
}

/**
 * Check whether a flag key was provided.
 */
export function hasFlag(flags: Map<string, string | boolean>, key: string): boolean {
  return flags.has(key);
}

export function shouldUseJsonOutput(flags: Map<string, string | boolean>): boolean {
  return !hasFlag(flags, "pretty");
}
