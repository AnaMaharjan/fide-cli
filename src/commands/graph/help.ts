export function graphCommandHelp(): string {
  return [
    "Usage:",
    "  fide graph add --local [--target <path>] --in <inputs> [--format <json|jsonl|fsd>] [--no-normalize] [--json] [--draft]",
    "  fide graph add --local [--target <path>] --params '<json>' [--format <json|jsonl|fsd>] [--no-normalize] [--json] [--draft]",
    "  fide graph add --local [--target <path>] --stdin [--format <json|jsonl|fsd>] [--no-normalize] [--json] [--draft]",
    "  fide graph validate --in <input> [--format <json|jsonl|fsd>] [--json]",
    "  fide graph root --in <input> [--format <json|jsonl|fsd>] [--json]",
    "  fide graph status [--target <path>]",
    "  fide graph query --sql \"<query>\" [--json] [--allow-write]",
    "",
    "Notes:",
    "  - Normalization is ON by default for `graph add`.",
    "  - Use `--target <path>` to target a .fide directory from any directory.",
    "  - Without `--target`, local graph commands use the current working directory unless `.fide/settings.json` provides a graphDir override.",
    "  - `--draft` writes a statement-doc markdown file to .fide/statement-drafts/YYYY/MM/DD/<root>.md.",
    "  - `graph add` only accepts statement inputs via `--stdin`, `--in`, or `--params`.",
    "  - `--stdin`/`--in` can auto-detect json/jsonl/fsd, or use --format to force.",
    "  - `validate`/`root` accept statement-doc inputs and json/jsonl batches.",
    "  - `status` reports whether the target directory has a .fide folder.",
  ].join("\n");
}
