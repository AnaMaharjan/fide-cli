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

export const pluginInstallCommand = defineCommand({
  surface: "plugin.install",
  command: "fide plugin install",
  outputType: "PluginInstallOutput",
  summary: "Install a Fide plugin",
  usage: [
    "fide plugin install <owner/repo>",
    "fide plugin install <git-url>",
    "fide plugin install <local-path>",
  ],
  params: {
    pretty: { kind: "boolean", shorthand: "-p", description: "Human-readable output" },
  },
  examples: [
    "fide plugin install owner/repo",
    "fide plugin install https://github.com/owner/repo.git",
    "fide plugin install ./plugins/sqlite",
  ],
  notes: [
    "Accepted plugin sources are intended to include GitHub repo shorthand, Git URLs, and local paths.",
    "This surface is scaffolded now; install behavior is not implemented yet.",
  ],
});

const PLUGIN_INSTALL_PARSE_KEYS = mergeBooleanKeySets(booleanKeysFromCommand(pluginInstallCommand));

export type PluginInstallOutput = {
  ok: false;
  scope: "plugin-install.v1";
  command: "fide plugin install";
  error: string;
  source?: string;
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

  const payload = errorResponse(
    "plugin-install.v1",
    "Plugin installation is not implemented yet.",
    { source },
    { command: "fide plugin install" },
  );

  if (shouldUseJsonOutput(parsed.flags)) {
    printJson(payload);
  } else {
    console.log(formatPretty("plugin-install.v1", payload) ?? JSON.stringify(payload, null, 2));
  }
  return 1;
}
