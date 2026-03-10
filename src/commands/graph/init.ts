import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { getStringFlag, hasFlag, parseArgs, shouldUseJsonOutput } from "../../util/args.js";
import { printJson } from "../../util/io.js";
import { COMMAND_SCHEMAS } from "../../util/schemas.js";

function initHelp(): string {
  return [
    "Usage:",
    "  fide graph init [--dir <path>] [--json]",
  ].join("\n");
}

/**
 * @description Initializes a minimal local .fide folder structure.
 */
export async function runInitCommand(args: string[]): Promise<number> {
  const { flags } = parseArgs(args);
  if (hasFlag(flags, "help") || hasFlag(flags, "-h")) {
    if (shouldUseJsonOutput(flags)) {
      printJson(COMMAND_SCHEMAS["graph.init"]);
    } else {
      console.log(initHelp());
    }
    return 0;
  }

  const targetDir = getStringFlag(flags, "dir");
  const root = targetDir ? resolve(process.cwd(), targetDir) : process.cwd();

  const directories = [
    resolve(root, ".fide"),
    resolve(root, ".fide/statements"),
  ];

  for (const directory of directories) {
    await mkdir(directory, { recursive: true });
  }

  if (shouldUseJsonOutput(flags)) {
    printJson({
      ok: true,
      root,
      created: directories,
    });
  } else {
    console.log(`Initialized .fide workspace at ${root}`);
    for (const directory of directories) {
      console.log(`- ${directory}`);
    }
  }

  return 0;
}
