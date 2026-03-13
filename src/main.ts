import { renderHelp } from "./util/help.js";

function helpText(): string {
  return [
    "fide CLI",
    "",
    renderHelp({
      sections: [
        {
          title: "Usage",
          items: [
            "  fide <group> [command] [flags]",
            "  fide docs <path>",
            "  fide schema [surface]",
          ],
        },
        {
          title: "Commands",
          items: [
            "  graph    init | add | draft | query | status | defs",
            "  docs     Resolve canonical docs pointers to local source content",
            "  schema   Introspect command schemas",
          ],
        },
        {
          title: "Flags",
          items: [
            "  --pretty, -p   Human-readable text output (default is JSON)",
            "  --help, -h     Show help",
          ],
        },
      ],
    }),
  ].join("\n");
}

/**
 * Execute the Fide CLI for the given argv token list.
 */
export async function runCli(argv: string[]): Promise<number> {
  if (argv.length === 0 || argv[0] === "--help" || argv[0] === "-h") {
    console.log(helpText());
    return 0;
  }

  const [group, command, ...rest] = argv;
  if (group === "schema") {
    const { runSchemaCommand } = await import("./commands/schema/index.js");
    return runSchemaCommand(command, rest);
  }

  if (group === "docs") {
    const { runDocsCommand } = await import("./commands/docs.js");
    return runDocsCommand([command, ...rest].filter((value): value is string => Boolean(value)));
  }

  switch (group) {
    case "graph": {
      const { runGraphCommand } = await import("./commands/graph/index.js");
      return runGraphCommand(command, rest);
    }
    default:
      console.error(`Unknown group: ${group}`);
      console.error("Run `fide --help` to see available commands.");
      return 1;
  }
}
