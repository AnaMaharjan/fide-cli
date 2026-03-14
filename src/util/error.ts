import { printJson } from "./io.js";

export type CliErrorPayload = {
  ok: false;
  scope: string;
  error: {
    code: string;
    message: string;
    hint?: string;
    didYouMean?: string;
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

const ENTITY_TYPES = [
  "Statement",
  "Person",
  "Organization",
  "SoftwareAgent",
  "NetworkResource",
  "PlatformAccount",
  "CryptographicAccount",
  "CreativeWork",
  "Concept",
  "Place",
  "Event",
  "Action",
  "PhysicalObject",
  "TextLiteral",
  "IntegerLiteral",
  "DecimalLiteral",
  "BoolLiteral",
  "DateLiteral",
  "TimeLiteral",
  "DateTimeLiteral",
  "DurationLiteral",
  "URILiteral",
  "JSONLiteral",
] as const;

const REFERENCE_TYPES = [
  "Statement",
  "NetworkResource",
  "TextLiteral",
  "IntegerLiteral",
  "DecimalLiteral",
  "BoolLiteral",
  "DateLiteral",
  "TimeLiteral",
  "DateTimeLiteral",
  "DurationLiteral",
  "URILiteral",
  "JSONLiteral",
] as const;

function editDistance(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i += 1) dp[i][0] = i;
  for (let j = 0; j <= b.length; j += 1) dp[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost,
      );
    }
  }
  return dp[a.length][b.length];
}

function findSuggestion(value: string, valid: readonly string[]): string | undefined {
  let best: string | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const candidate of valid) {
    const distance = editDistance(value.toLowerCase(), candidate.toLowerCase());
    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }
  return bestDistance <= 3 ? best : undefined;
}

function graphDefsNext(path = "/vocabulary"): Record<string, string> {
  return {
    defsCommand: "fide graph defs",
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

function normalizeCliError(err: unknown, scope: string): CliErrorPayload {
  const message = err instanceof Error ? err.message : String(err);

  const invalidEntityType = message.match(/^Invalid entityType: (.+)$/);
  if (invalidEntityType) {
    const value = invalidEntityType[1];
    const didYouMean = findSuggestion(value, ENTITY_TYPES);
    return {
      ok: false,
      scope,
      error: {
        code: "validation_error",
        message: `Invalid entityType: ${value}`,
        ...(didYouMean ? { didYouMean } : {}),
        hint: value === "Text"
          ? "Use TextLiteral for plain text values. Run `fide graph defs` to inspect valid entity types."
          : "Run `fide graph defs` to inspect valid entity types.",
      },
      next: graphDefsNext(didYouMean === "TextLiteral" ? "/vocabulary/definitions/text-literal" : "/vocabulary"),
    };
  }

  const invalidReferenceType = message.match(/^Invalid referenceType: (.+)$/);
  if (invalidReferenceType) {
    const value = invalidReferenceType[1];
    const didYouMean = findSuggestion(value, REFERENCE_TYPES);
    return {
      ok: false,
      scope,
      error: {
        code: "validation_error",
        message: `Invalid referenceType: ${value}`,
        ...(didYouMean ? { didYouMean } : {}),
        hint: "Run `fide graph defs` to inspect valid reference types.",
      },
      next: graphDefsNext(didYouMean === "TextLiteral" ? "/vocabulary/definitions/text-literal" : "/vocabulary"),
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
    },
  };
}

export function printCliError(err: unknown, options: CliErrorOptions): void {
  const payload = normalizeCliError(err, options.scope);

  if (options.pretty) {
    console.error(`${scopeToTitle(payload.scope)}: ${payload.error.message}`);
    if (payload.error.didYouMean) {
      console.error(`Did you mean ${payload.error.didYouMean}?`);
    }
    if (payload.error.hint) {
      console.error(payload.error.hint);
    }
    if (payload.next?.defsCommand) {
      console.error(`Next: ${payload.next.defsCommand}`);
    }
    if (payload.next?.docsCommand) {
      console.error(`Docs: ${payload.next.docsCommand}`);
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
