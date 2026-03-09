function helpText(): string {
  return [
    "fide CLI",
    "",
    "Usage:",
    "  fide <group> [command] [flags]",
    "  fide init [flags]",
    "  fide schema [surface] [--json]",
    "",
    "Groups:",
    "  graph       add | validate | root | query | status",
    "",
    "Global:",
    "  --json, --output json   Machine-readable output (default when piped)",
    "  OUTPUT_FORMAT=json     Same as --json",
    "  --help, -h             Show help",
    "",
    "Agent DX:",
    "  fide schema <surface>  Introspect command schemas (--help --json for per-command)",
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
  if (group === "init") {
    const initArgs = [command, ...rest].filter((value): value is string => typeof value === "string");
    const { runInitCommand } = await import("./commands/graph/init.js");
    return runInitCommand(initArgs);
  }

  if (group === "schema") {
    const { runSchemaCommand } = await import("./commands/schema/index.js");
    return runSchemaCommand(command, rest);
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
