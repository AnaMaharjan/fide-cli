import { renderHelp } from "./util/help.js";
import { printCliError } from "./util/error.js";

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
          title: "Groups",
          items: [
            "  app      Saved query storage and query-run metadata",
            "  graph    Statement authoring, local workspace setup, and graph definitions",
            "  store    Configured sqlite/postgres backends and materialization",
            "  docs     Resolve canonical docs pointers to local source content",
            "  schema   Introspect command schemas",
          ],
        },
        {
          title: "Workflows",
          items: [
            "  fide graph init                       Initialize a local .fide workspace",
            "  fide graph write '<json>'             Write statement inputs into the local workspace",
            "  fide store init --type sqlite ...     Initialize a configured backend target",
            "  fide store sql --store primary 'select * from statements limit 10'",
            "  fide store materialize --store combined",
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
  const pretty = argv.includes("--pretty") || argv.includes("-p");

  try {
    if (argv.length === 0 || argv[0] === "--help" || argv[0] === "-h") {
      console.log(helpText());
      return 0;
    }

    const [group, command, ...rest] = argv;
    if (group === "schema") {
      const { runSchemaCommand } = await import("./commands/schema/index.js");
      return await runSchemaCommand(command, rest);
    }

    if (group === "docs") {
      const { runDocsCommand } = await import("./commands/docs.js");
      return await runDocsCommand([command, ...rest].filter((value): value is string => Boolean(value)));
    }

    switch (group) {
      case "app": {
        const { runAppCommand } = await import("./commands/app/index.js");
        return await runAppCommand(command, rest);
      }
      case "graph": {
        const { runGraphCommand } = await import("./commands/graph/index.js");
        return await runGraphCommand(command, rest);
      }
      case "store": {
        const { runStoreCommand } = await import("./commands/store/index.js");
        return await runStoreCommand(command, rest);
      }
      default:
        throw new Error(`Unknown group: ${group}. Run \`fide --help\` to see available commands.`);
    }
  } catch (err) {
    const group = argv[0] ?? "fide";
    const command = argv[1];
    const scope = group === "fide" || !group
      ? "fide.v1"
      : command
        ? `${group}-${command}.v1`
        : `${group}.v1`;
    printCliError(err, { scope, pretty });
    return 1;
  }
}
