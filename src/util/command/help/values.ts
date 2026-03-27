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
  const requires = definition.requires ? ` (requires: ${definition.requires})` : "";
  const required = definition.isRequired ? " (required)" : "";
  const suggested = definition.suggested ? ` (suggested: ${definition.suggested})` : "";
  if (definition.value) {
    const value = Array.isArray(definition.value) ? definition.value.join(" | ") : definition.value;
    lines.push(`${indent}${definition.label}: ${value}${required}${suggested}${requires}`);
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
