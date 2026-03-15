import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { hasFlag, parseArgs, shouldUseJsonOutput } from "../../util/args.js";
import { renderHelp } from "../../util/help.js";
import { printJson } from "../../util/io.js";
import { resolveGraphTarget } from "../../util/graph/target.js";
import { getLocalWorkspaceWarnings } from "../../util/graph/local-disk-warning.js";

function initHelp(): string {
  return renderHelp({
    sections: [
      {
        title: "Usage",
        items: [
          "  fide graph init",
          "  fide graph init --target <path>",
          "  fide graph init --target <path> --dangerously-drop --yes",
        ],
      },
      {
        title: "Flags",
        items: [
          "  --target <path>               Local workspace path override",
          "  --gitignore                   Add local graph outputs to .gitignore",
          "  --dangerously-drop            Reset the resolved local workspace before re-initializing",
          "  --yes                         Confirm --dangerously-drop",
          "  --pretty, -p                  Human-readable output",
        ],
      },
      {
        title: "Notes",
        items: [
          "  - `fide graph init` only initializes local workspaces.",
          "  - Uses `FIDE_DIR` or the nearest `.fide` directory when `--target` is omitted.",
          "  - Use `fide store init` for configured sqlite/postgres targets.",
        ],
      },
    ],
  });
}

function isWithinRoot(root: string, targetPath: string): boolean {
  const rel = relative(root, targetPath);
  return rel !== ".." && !rel.startsWith("../") && rel !== "" && !rel.startsWith("..\\");
}

function toGitignoreEntry(root: string, targetPath: string, isDirectory: boolean): string | null {
  if (!isWithinRoot(root, targetPath)) return null;
  const rel = relative(root, targetPath).replaceAll("\\", "/");
  if (!rel || rel === ".") return null;
  return isDirectory ? `${rel}/` : rel;
}

async function updateGitignore(entries: string[]): Promise<{ path: string; added: string[] }> {
  const gitignorePath = resolve(process.cwd(), ".gitignore");
  const current = existsSync(gitignorePath) ? await readFile(gitignorePath, "utf8") : "";
  const present = new Set(current.split(/\r?\n/).map((line) => line.trim()).filter(Boolean));
  const added = entries.filter((entry) => !present.has(entry));
  if (added.length === 0) {
    return { path: gitignorePath, added: [] };
  }

  const next = current.length === 0
    ? `${added.join("\n")}\n`
    : current.endsWith("\n")
      ? `${current}${added.join("\n")}\n`
      : `${current}\n${added.join("\n")}\n`;
  await writeFile(gitignorePath, next, "utf8");
  return { path: gitignorePath, added };
}

export async function runInitCommand(args: string[]): Promise<number> {
  const parsed = parseArgs(args);
  const flags = parsed.flags;
  if (hasFlag(flags, "help") || hasFlag(flags, "-h")) {
    console.log(initHelp());
    return 0;
  }

  if (flags.has("type") || flags.has("connection") || flags.has("schema") || flags.has("recipe")) {
    throw new Error("`fide graph init` does not manage configured backend targets. Use `fide store init`.");
  }

  const target = resolveGraphTarget(flags);
  if (target.type !== "local") {
    throw new Error("`fide graph init` only supports local workspaces. Use `fide store init` for configured sqlite/postgres targets.");
  }

  const dangerouslyDrop = hasFlag(flags, "dangerously-drop");
  const confirmed = hasFlag(flags, "yes");
  const shouldUpdateGitignore = hasFlag(flags, "gitignore");
  if (dangerouslyDrop && !confirmed) {
    throw new Error("`--dangerously-drop` requires `--yes`.");
  }
  if (!dangerouslyDrop && confirmed) {
    throw new Error("`--yes` is only valid with `--dangerously-drop`.");
  }
  if (parsed.positionals.length > 0) {
    throw new Error("Unexpected positional arguments.");
  }

  const root = target.root;
  const fideDir = resolve(root, ".fide");
  if (dangerouslyDrop) {
    await rm(fideDir, { recursive: true, force: true });
  }

  const directories = [fideDir];
  for (const directory of directories) {
    await mkdir(directory, { recursive: true });
  }

  const gitignoreEntries = shouldUpdateGitignore
    ? [
      toGitignoreEntry(process.cwd(), resolve(root, ".fide", "statements"), true),
      toGitignoreEntry(process.cwd(), resolve(root, ".fide", "drafts"), true),
    ].filter((value): value is string => Boolean(value))
    : [];
  const gitignore = gitignoreEntries.length > 0 ? await updateGitignore(gitignoreEntries) : null;

  if (shouldUseJsonOutput(flags)) {
    printJson({
      ok: true,
      root,
      created: directories,
      dropped: dangerouslyDrop,
      gitignorePath: gitignore?.path,
      gitignoreAdded: gitignore?.added ?? [],
      warnings: getLocalWorkspaceWarnings(root, { gitignore: target.gitignore }),
    });
  } else {
    console.log(`Initialized .fide workspace at ${root}`);
    for (const directory of directories) {
      console.log(`- ${directory}`);
    }
    if (gitignore && gitignore.added.length > 0) {
      console.log(`Updated ${gitignore.path}`);
    }
  }

  return 0;
}
