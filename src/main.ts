import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { renderHelp } from "./util/help.js";
import { printCliError } from "./util/error.js";

function readCliVersion(): string {
  const srcDir = dirname(fileURLToPath(import.meta.url));
  const packageJsonPath = resolve(srcDir, "..", "package.json");
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as { version?: unknown };
  if (typeof packageJson.version !== "string" || packageJson.version.trim().length === 0) {
    throw new Error("CLI package version is missing from package.json.");
  }
  return packageJson.version;
}

function helpText(): string {
  return [
    "fide CLI",
    "",
    renderHelp({
      sections: [
        {
          title: "Usage",
          items: [
            "  fide --version",
            "  fide <group> [command] [flags]",
            "  fide login [flags]",
            "  fide logout [flags]",
            "  fide whoami [flags]",
            "  fide keys <command> [flags]",
            "  fide docs <path>",
            "  fide schema [surface]",
          ],
        },
        {
          title: "Commands",
          items: [
            "  login    Save auth for this machine",
            "  keys     List, create, and revoke API keys",
            "  logout   Remove saved auth for a profile",
            "  status   Inspect machine, project, and workspace context",
            "  whoami   Show the current authenticated user",
          ],
        },
        {
          title: "Groups",
          items: [
            "  graph    Local graph work and hosted graph/query management",
            "  workspace Workspace info, members, roles, and settings",
            "  docs     Resolve local docs pointers",
            "  schema   Print command schemas",
          ],
        },
        {
          title: "Workflows",
          items: [
            "  fide status",
            "  fide login --profile work",
            "  fide whoami",
            "  fide keys list",
            "  fide graph statements write '<json>'",
            "  fide graph list --workspace <workspace-id>",
            "  fide graph save --workspace <workspace-id> --graph primary --type postgres --schema fide_graph --connection-ref primary-graph",
            "  fide graph query run --graph primary 'select * from statements limit 10'",
            "  fide graph build --graph combined",
            "  fide workspace list",
          ],
        },
        {
          title: "Flags",
          items: [
            "  --pretty, -p   Human-readable text output (default is JSON)",
            "  --version      Show CLI version",
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

    if (argv[0] === "--version") {
      console.log(readCliVersion());
      return 0;
    }

    const [group, command, ...rest] = argv;
    if (group === "schema") {
      const { runSchemaCommand } = await import("./commands/schema/index.js");
      return await runSchemaCommand(command, rest);
    }

    if (group === "status") {
      const { runStatusCommand } = await import("./commands/status.js");
      return await runStatusCommand([command, ...rest].filter((value): value is string => Boolean(value)));
    }

    if (group === "login") {
      const { runAuthLogin } = await import("./commands/auth/login.js");
      return await runAuthLogin([command, ...rest].filter((value): value is string => Boolean(value)));
    }

    if (group === "logout") {
      const { runAuthLogout } = await import("./commands/auth/logout.js");
      return await runAuthLogout([command, ...rest].filter((value): value is string => Boolean(value)));
    }

    if (group === "whoami") {
      const { runAuthWhoami } = await import("./commands/auth/whoami.js");
      return await runAuthWhoami([command, ...rest].filter((value): value is string => Boolean(value)));
    }

    if (group === "keys") {
      const { runAuthKeysCommand } = await import("./commands/auth/keys/index.js");
      return await runAuthKeysCommand([command, ...rest].filter((value): value is string => Boolean(value)));
    }

    if (group === "docs") {
      const { runDocsCommand } = await import("./commands/docs.js");
      return await runDocsCommand([command, ...rest].filter((value): value is string => Boolean(value)));
    }

    switch (group) {
      case "graph": {
        const { runGraphCommand } = await import("./commands/graph/index.js");
        return await runGraphCommand(command, rest);
      }
      case "workspace": {
        const { runWorkspaceCommand } = await import("./commands/workspace/index.js");
        return await runWorkspaceCommand(command, rest);
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
