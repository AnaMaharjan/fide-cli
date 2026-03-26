import { assertPublicId } from "@chris-test/workspace/public-ids";

export function assertWorkspaceId(value: string): string {
  return assertPublicId("workspace", value);
}

export function assertAccountId(value: string): string {
  return assertPublicId("account", value);
}

export function assertAuthRequestId(value: string): string {
  return assertPublicId("auth_request", value);
}
