import { assertPublicId } from "@chris-test/workspace/public-ids";

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
  return assertPublicId("workspace", value);
}

export function assertAccountId(value: string): string {
  return assertPublicId("account", value);
}

export function assertAuthRequestId(value: string): string {
  return assertPublicId("auth_request", value);
}
