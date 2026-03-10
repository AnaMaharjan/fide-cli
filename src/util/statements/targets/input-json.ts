import type { StatementInput } from "@chris-test/fcp";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isStatementRoleInput(
  value: unknown,
): value is {
  referenceIdentifier: string;
  entityType: string;
  referenceType: string;
} {
  return (
    isObject(value) &&
    typeof value.referenceIdentifier === "string" &&
    typeof value.entityType === "string" &&
    typeof value.referenceType === "string"
  );
}

/**
 * Validate raw JSON payload shape for `StatementInput[]`.
 */
function normalizeStatementInputs(parsed: unknown): StatementInput[] {
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error("Invalid input payload. Expected non-empty array of statement inputs.");
  }

  return parsed.map((item) => {
    if (!isObject(item)) {
      throw new Error("Invalid input item. Each item must be a statement input object.");
    }

    const { subject, predicate, object } = item;
    if (!isStatementRoleInput(subject) || !isStatementRoleInput(predicate) || !isStatementRoleInput(object)) {
      throw new Error("Invalid input item. Each item must include subject, predicate, and object with referenceIdentifier, entityType, and referenceType.");
    }

    return {
      subject: {
        referenceIdentifier: subject.referenceIdentifier,
        entityType: subject.entityType as StatementInput["subject"]["entityType"],
        referenceType: subject.referenceType as StatementInput["subject"]["referenceType"],
      },
      predicate: {
        referenceIdentifier: predicate.referenceIdentifier,
        entityType: predicate.entityType as StatementInput["predicate"]["entityType"],
        referenceType: predicate.referenceType as StatementInput["predicate"]["referenceType"],
      },
      object: {
        referenceIdentifier: object.referenceIdentifier,
        entityType: object.entityType as StatementInput["object"]["entityType"],
        referenceType: object.referenceType as StatementInput["object"]["referenceType"],
      },
    };
  });
}

/**
 * Parse statement inputs from JSON array payload.
 */
export function parseJsonInputs(raw: string): StatementInput[] {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error("Input payload is empty.");
  }

  const parsed = JSON.parse(trimmed) as unknown;
  return normalizeStatementInputs(parsed);
}
