import { hasFlag, parseArgs, shouldUseJsonOutput } from "../../util/command/args.js";
import {
  booleanKeysFromCommand,
  defineCommand,
  mergeBooleanKeySets,
  renderCommandHelp,
} from "../../util/command/command-metadata.js";
import { printJson } from "../../util/command/io.js";
import { formatPretty } from "../../util/command/pretty.js";
import { errorResponse } from "../../util/command/response.js";
import {
  installLocalPluginSource,
  isLikelyLocalPluginSource,
} from "../../util/plugins/index.js";

export const pluginInstallCommand = defineCommand({
  surface: "plugin.install",
  command: "fide plugin install",
  outputType: "PluginInstallOutput",
  summary: "Install a Fide plugin",
  usage: [
    "fide plugin install <local-path>",
    "fide plugin install <source> --id <plugin-id>",
  ],
  paramOrder: ["id", "pretty"],
  params: {
    id: { kind: "string", description: "Override the installed plugin id", valueLabel: "<plugin-id>" },
    pretty: { kind: "boolean", shorthand: "-p", description: "Human-readable output" },
  },
  examples: [
    "fide plugin install ./plugins/sqlite",
    "fide plugin install ./plugins/sqlite --id chrislally/sqlite-dev",
  ],
  notes: [
    "GitHub repo shorthand and Git URL sources are planned.",
    "The plugin manifest id acts as the default installed id; use --id to override it.",
    "Only local-path installation is implemented right now.",
  ],
});

const PLUGIN_INSTALL_PARSE_KEYS = mergeBooleanKeySets(booleanKeysFromCommand(pluginInstallCommand));
const PLUGIN_INSTALL_SCOPE = "plugin-install.v1";

export type PluginInstallOutput = {
  ok: true | false;
  scope: typeof PLUGIN_INSTALL_SCOPE;
  command: "fide plugin install";
  error?: string;
  source?: string;
  pluginId?: string;
  version?: string;
  installDir?: string;
  next?: Record<string, unknown>;
};

export async function runPluginInstall(args: string[]): Promise<number> {
  const parsed = parseArgs(args, { booleanKeys: PLUGIN_INSTALL_PARSE_KEYS });
  if (hasFlag(parsed.flags, "help") || hasFlag(parsed.flags, "-h")) {
    console.log(renderCommandHelp(pluginInstallCommand));
    return 0;
  }

  const source = parsed.positionals[0] ?? null;
  if (!source) {
    throw new Error("Missing plugin source. Pass a repo, URL, or local path.");
  }
  const idOverride = typeof parsed.flags.get("id") === "string" ? String(parsed.flags.get("id")) : undefined;

  if (isLikelyLocalPluginSource(source)) {
    // Plugin installs are project-local by default. The resolved .fide directory
    // determines the target .fide/plugins location for this install.
    //
    // The plugin manifest id acts as the default installed id, but callers can
    // override it with --id when they want a different stable project-local id.
    //
    // Local plugin sources are expected to be ready to run when installed.
    // This surface copies the plugin into the project; it does not install npm
    // dependencies or build plugin source.
    const installed = await installLocalPluginSource(source, { id: idOverride });
    const payload = {
      ok: true as const,
      scope: PLUGIN_INSTALL_SCOPE,
      command: "fide plugin install" as const,
      source,
      pluginId: installed.manifest.id,
      version: installed.manifest.version,
      installDir: installed.installDir,
      next: {
        projectConfigPath: ".fide/config.json",
      },
    };

    if (shouldUseJsonOutput(parsed.flags)) {
      printJson(payload);
    } else {
      console.log(formatPretty("plugin-install.v1", payload) ?? JSON.stringify(payload, null, 2));
    }
    return 0;
  }

  const payload = errorResponse(
    PLUGIN_INSTALL_SCOPE,
    "Plugin installation is only implemented for local paths right now.",
    { source },
    { command: "fide plugin install" },
  );

  if (shouldUseJsonOutput(parsed.flags)) {
    printJson(payload);
  } else {
    console.log(formatPretty(PLUGIN_INSTALL_SCOPE, payload) ?? JSON.stringify(payload, null, 2));
  }
  return 1;
}
