type ResponseOptions = {
  command?: string;
  next?: Record<string, unknown>;
};

type SuccessResponse<T extends Record<string, unknown>> = {
  ok: true;
  scope: string;
  command?: string;
  next?: Record<string, unknown>;
} & T;

type ErrorResponse = {
  ok: false;
  scope: string;
  command?: string;
  error: string;
} & Record<string, unknown>;

export function okResponse<T extends Record<string, unknown>>(
  scope: string,
  data: T,
  options: ResponseOptions = {},
): SuccessResponse<T> {
  return {
    ok: true,
    scope,
    ...(options.command ? { command: options.command } : {}),
    ...(options.next ? { next: options.next } : {}),
    ...data,
  };
}

export function errorResponse(
  scope: string,
  error: string,
  data: Record<string, unknown> = {},
  options: Omit<ResponseOptions, "next"> = {},
): ErrorResponse {
  return {
    ok: false,
    scope,
    ...(options.command ? { command: options.command } : {}),
    error,
    ...data,
  };
}
