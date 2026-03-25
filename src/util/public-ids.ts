const PUBLIC_ID_SUFFIX = "[23456789abcdefghjkmnpqrstvwxyz]{16}";

function assertPattern(label: string, value: string, prefix: string): string {
  const normalized = value.trim().toLowerCase();
  const pattern = new RegExp(`^${prefix}_${PUBLIC_ID_SUFFIX}$`, "u");
  if (!pattern.test(normalized)) {
    throw new Error(`Invalid ${label}. Expected ${prefix}_<16-char lowercase id>.`);
  }
  return normalized;
}

export function assertWorkspaceId(value: string): string {
  return assertPattern("workspace id", value, "workspace");
}

export function assertUserId(value: string): string {
  return assertPattern("user id", value, "user");
}

export function assertAuthRequestId(value: string): string {
  return assertPattern("agent auth request id", value, "auth_request");
}
