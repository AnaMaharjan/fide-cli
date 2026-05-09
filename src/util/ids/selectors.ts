function assertSelector(label: string, value: string): string {
  const normalized = value.trim();
  const pattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/u;
  if (!pattern.test(normalized)) {
    throw new Error(`Invalid ${label}. Use only letters, numbers, dots, underscores, or hyphens.`);
  }
  return normalized;
}

export function assertGraphKey(value: string): string {
  return assertSelector("graph key", value);
}

export function assertWorldModelKey(value: string): string {
  return assertSelector("world model key", value);
}

export function assertQueryName(value: string): string {
  return assertSelector("query name", value);
}

export function assertRoleKey(value: string): string {
  return assertSelector("role key", value);
}
