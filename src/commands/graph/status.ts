import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { hasFlag, parseArgs } from "../../util/args.js";
import { renderHelp } from "../../util/help.js";
import { printJson } from "../../util/io.js";
import { resolveGraphTarget } from "../../util/graph/target.js";
import { getLocalWorkspaceWarnings } from "../../util/graph/local-disk-warning.js";

export async function runGraphStatus(args: string[] = []): Promise<number> {
  const { flags, positionals } = parseArgs(args);
  if (hasFlag(flags, "help") || hasFlag(flags, "-h")) {
    console.log(renderHelp({
      sections: [
        {
          title: "Usage",
          items: [
            "  fide graph status",
            "  fide graph status --fide-dir <path>",
          ],
        },
        {
          title: "Flags",
          items: [
            "  --fide-dir <path>  Local .fide directory override",
          ],
        },
        {
          title: "Notes",
          items: [
            "  - `fide graph status` reports local `.fide` directory status.",
            "  - Uses `FIDE_DIR` or the nearest `.fide` directory when `--fide-dir` is omitted.",
            "  - Use `fide store status` for configured sqlite/postgres backends.",
          ],
        },
      ],
    }));
    return 0;
  }

  if (positionals.length > 0) {
    throw new Error("`graph status` does not accept positional arguments. Use `--fide-dir <path>` to override the local .fide directory.");
  }

  const graphTarget = resolveGraphTarget(flags);
  if (graphTarget.type !== "local") {
    throw new Error("`fide graph status` only supports local workspaces. Use `fide store status` for configured sqlite/postgres targets.");
  }

  const { root, configuredFromSettings } = graphTarget;
  const workspaceDir = resolve(root, ".fide");
  const statementsDir = resolve(workspaceDir, "statements");
  const hasFide = existsSync(workspaceDir);
  const hasStatements = existsSync(statementsDir);

  const missing: string[] = [];
  if (!hasFide) missing.push(".fide");

  printJson({
    ok: true,
    configured: true,
    next: {
      writeHelpCommand: "fide graph write -h",
      writeCommand: "fide graph write ...",
    },
    root,
    connection: graphTarget.connection ?? root,
    configuredFromSettings,
    workspaceDir,
    statementsDir,
    statementsDirPresent: hasStatements,
    missing,
    key: graphTarget.key,
    warnings: getLocalWorkspaceWarnings(root, { gitignore: graphTarget.gitignore }),
  });
  return 0;
}
