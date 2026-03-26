import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { renderHelp } from "./util/command/help.js";
import { printCliError } from "./util/command/error.js";
import { ensureFideEnvLoaded } from "./util/project/fide-dir.js";

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
            "  fide start [flags]",
            "  fide stop [flags]",
            "  fide logout [flags]",
            "  fide whoami [flags]",
            "  fide docs <path>",
            "  fide schema [surface]",
            "  fide query <command> [flags]",
            "  fide statements <command> [flags]",
          ],
        },
        {
          title: "Commands",
          items: [
            "  login    Save auth for this machine",
            "  logout   Remove saved auth for an account",
            "  start    Start the background sync agent for this project",
            "  stop     Stop the background sync agent",
            "  status   Inspect machine auth, project context, and sync state",
            "  whoami   Show the current authenticated user",
          ],
        },
        {
          title: "Groups",
          items: [
            "  graph    Local graph work and hosted graph/query projection",
            "  query    Local query authoring and execution",
            "  statements Local statement batch and draft authoring",
            "  workspace Workspace info, members, and roles",
            "  docs     Resolve local docs pointers",
            "  schema   Print command schemas",
          ],
        },
        {
          title: "Workflows",
          items: [
            "  fide status",
            "  fide login",
            "  fide start",
            "  fide stop",
            "  FIDE_SYNC_BASE_URL=https://sync.fide.work fide start",
            "  fide whoami",
            "  fide statements write '<json>'",
            "  fide graph list --workspace workspace_<suffix>",
            "  fide graph save --workspace workspace_<suffix> --graph primary --type postgres",
            "  fide query run --graph primary 'select * from statements limit 10'",
            "  fide graph build --graph combined",
            "  fide workspace list",
          ],
        },
        {
          title: "Notes",
          items: [
            "  - `fide start` runs a detached background agent and returns immediately.",
            "  - The current project `.fide/settings.json` is the source of truth for hosted graph sync.",
            "  - Hosted graph sync currently projects shared graph metadata only; local connection settings stay local.",
            "  - Query files are authored locally and synced by `fide start` into the selected workspace.",
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
    ensureFideEnvLoaded();

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

    if (group === "start") {
      const { runStartCommand } = await import("./commands/start.js");
      return await runStartCommand([command, ...rest].filter((value): value is string => Boolean(value)));
    }

    if (group === "stop") {
      const { runStopCommand } = await import("./commands/stop.js");
      return await runStopCommand([command, ...rest].filter((value): value is string => Boolean(value)));
    }

    if (group === "__sync-runner") {
      const { runSyncRunnerCommand } = await import("./commands/start.js");
      return await runSyncRunnerCommand([command, ...rest].filter((value): value is string => Boolean(value)));
    }

    if (group === "logout") {
      const { runAuthLogout } = await import("./commands/auth/logout.js");
      return await runAuthLogout([command, ...rest].filter((value): value is string => Boolean(value)));
    }

    if (group === "whoami") {
      const { runAuthWhoami } = await import("./commands/auth/whoami.js");
      return await runAuthWhoami([command, ...rest].filter((value): value is string => Boolean(value)));
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
      case "query": {
        const { runQueryCommand } = await import("./commands/query/index.js");
        return await runQueryCommand([command, ...rest].filter((value): value is string => Boolean(value)));
      }
      case "statements": {
        const { runStatementsCommand } = await import("./commands/statements/index.js");
        return await runStatementsCommand([command, ...rest].filter((value): value is string => Boolean(value)));
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
