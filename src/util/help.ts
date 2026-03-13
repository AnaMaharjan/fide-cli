type HelpSection = {
  title: "Usage" | "Commands" | "Flags" | "Modes" | "Notes" | "Examples" | "Surfaces";
  items: string[];
};

type RenderHelpOptions = {
  sections: HelpSection[];
};

export function renderHelp(options: RenderHelpOptions): string {
  const lines: string[] = [];

  for (const section of options.sections) {
    if (section.items.length === 0) continue;
    if (lines.length > 0) lines.push("");
    lines.push(`${section.title}:`);
    lines.push(...section.items);
  }

  return lines.join("\n");
}
