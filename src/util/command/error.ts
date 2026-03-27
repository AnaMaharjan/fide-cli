import { printJson } from "./io.js";

export type CliErrorPayload = {
  ok: false;
  scope: string;
  error: {
    code: string;
    message: string;
    hint?: string;
    details?: Record<string, unknown>;
  };
  next?: Record<string, unknown>;
};

type CliErrorOptions = {
  scope: string;
  pretty: boolean;
};

function scopeToTitle(scope: string): string {
  return scope.replace(/[-.]/g, " ");
}

function statementsGuideNext(path = "/vocabulary"): Record<string, string> {
  return {
    guideCommand: "fide statements guide",
    docsCommand: `fide docs ${path}`,
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function getNestedRecord(value: unknown, key: string): Record<string, unknown> | null {
  const record = asRecord(value);
  return record ? asRecord(record[key]) : null;
}

function getStringField(value: unknown, key: string): string | undefined {
  const record = asRecord(value);
  const field = record?.[key];
  return typeof field === "string" && field.length > 0 ? field : undefined;
}

function getDbErrorInfo(err: unknown): {
  message: string;
  code?: string;
  details?: Record<string, unknown>;
} | null {
  const record = asRecord(err);
  if (!record) return null;

  const cause = getNestedRecord(err, "cause");
  const code = getStringField(err, "code") ?? getStringField(cause, "code");
  const detail = getStringField(err, "detail") ?? getStringField(cause, "detail");
  const constraint = getStringField(err, "constraint") ?? getStringField(cause, "constraint");
  const table = getStringField(err, "table") ?? getStringField(cause, "table");
  const column = getStringField(err, "column") ?? getStringField(cause, "column");
  const dbMessage =
    getStringField(cause, "message") ??
    getStringField(err, "message");

  if (!dbMessage) return null;

  const wrappedQueryFailure = dbMessage.startsWith("Failed query:");
  if (!wrappedQueryFailure && !code && !detail && !constraint && !table && !column) {
    return null;
  }

  const details: Record<string, unknown> = {};
  if (code) details.dbCode = code;
  if (detail) details.dbDetail = detail;
  if (constraint) details.constraint = constraint;
  if (table) details.table = table;
  if (column) details.column = column;

  const message = detail
    ? `Database query failed: ${detail}`
    : wrappedQueryFailure
      ? `Database query failed: ${dbMessage.replace(/^Failed query:\s*/u, "").split("\n")[0]}`
      : `Database query failed: ${dbMessage}`;

  return {
    message,
    code,
    details: Object.keys(details).length > 0 ? details : undefined,
  };
}

function getTopLevelRecord(err: unknown): Record<string, unknown> | null {
  return err && typeof err === "object" ? err as Record<string, unknown> : null;
}

function normalizeCliError(err: unknown, scope: string): CliErrorPayload {
  const message = err instanceof Error ? err.message : String(err);
  const record = getTopLevelRecord(err);

  const invalidEntityType = message.match(/^Invalid entityType: (.+)$/);
  if (invalidEntityType) {
    const value = invalidEntityType[1];
    return {
      ok: false,
      scope,
      error: {
        code: "validation_error",
        message: `Invalid entityType: ${value}`,
        hint: value === "Text"
          ? "Use TextLiteral for plain text values. Run `fide statements guide` to inspect valid entity types."
          : "Run `fide statements guide` to inspect valid entity types.",
      },
      next: statementsGuideNext(value === "Text" ? "/vocabulary/definitions/text-literal" : "/vocabulary"),
    };
  }

  const invalidReferenceType = message.match(/^Invalid referenceType: (.+)$/);
  if (invalidReferenceType) {
    const value = invalidReferenceType[1];
    return {
      ok: false,
      scope,
      error: {
        code: "validation_error",
        message: `Invalid referenceType: ${value}`,
        hint: "Run `fide statements guide` to inspect valid reference types.",
      },
      next: statementsGuideNext(value === "Text" ? "/vocabulary/definitions/text-literal" : "/vocabulary"),
    };
  }

  const dbError = getDbErrorInfo(err);
  if (dbError) {
    return {
      ok: false,
      scope,
      error: {
        code: "database_error",
        message: dbError.message,
        ...(dbError.details ? { details: dbError.details } : {}),
      },
    };
  }

  return {
    ok: false,
    scope,
    error: {
      code: "validation_error",
      message,
      ...(typeof record?.hint === "string" ? { hint: record.hint } : {}),
      ...(record?.details && typeof record.details === "object" ? { details: record.details as Record<string, unknown> } : {}),
    },
    ...(record?.next && typeof record.next === "object" ? { next: record.next as Record<string, unknown> } : {}),
  };
}

export function printCliError(err: unknown, options: CliErrorOptions): void {
  const payload = normalizeCliError(err, options.scope);

  if (options.pretty) {
    console.error(`${scopeToTitle(payload.scope)}: ${payload.error.message}`);
    if (payload.error.hint) {
      console.error(payload.error.hint);
    }
    if (payload.next) {
      for (const [key, value] of Object.entries(payload.next)) {
        if (typeof value === "string") {
          const label = key === "docsCommand"
            ? "Docs"
            : key === "guideCommand"
              ? "Next"
              : `Next (${key})`;
          console.error(`${label}: ${value}`);
        }
      }
    }
    if (payload.error.details) {
      for (const [key, value] of Object.entries(payload.error.details)) {
        console.error(`${key}: ${String(value)}`);
      }
    }
    return;
  }

  printJson(payload);
}
