export type HelpValueDefinition = {
  label: string;
  value?: string | readonly string[];
  suggested?: string;
  requires?: string;
  isRequired?: boolean;
  children?: HelpValueDefinition[];
};

function renderValueDefinition(
  definition: HelpValueDefinition,
  depth: number,
  lines: string[],
): void {
  const indent = "  ".repeat(depth + 1);
  const childIndent = `${indent}  `;
  const requires = definition.requires ? ` (requires: ${definition.requires})` : "";
  const required = definition.isRequired ? " (required)" : "";
  const suggested = definition.suggested ? ` (suggested: ${definition.suggested})` : "";
  if (definition.value) {
    const value = definition.value;
    if (Array.isArray(value)) {
      lines.push(`${indent}${definition.label}: ${value.join(" | ")}${required}${suggested}${requires}`);
    } else {
      const scalarValue = value as string;
      if (scalarValue.includes("\n")) {
      lines.push(`${indent}${definition.label}:${required}${suggested}${requires}`);
        for (const line of scalarValue.split("\n")) {
          lines.push(`${childIndent}${line}`);
        }
      } else {
        lines.push(`${indent}${definition.label}: ${scalarValue}${required}${suggested}${requires}`);
      }
    }
  } else {
    lines.push(`${indent}${definition.label}${requires}${required}`);
  }
  for (const child of definition.children ?? []) {
    renderValueDefinition(child, depth + 1, lines);
  }
}

export function renderValueDefinitions(definitions: readonly HelpValueDefinition[]): string[] {
  const lines: string[] = [];
  definitions.forEach((definition, index) => {
    if (index > 0) {
      lines.push("");
    }
    renderValueDefinition(definition, 0, lines);
  });
  return lines;
}
