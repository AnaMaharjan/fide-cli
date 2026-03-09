export function graphCommandHelp(): string {
  return [
    "Usage:",
    "  fide graph add --subject <raw> --subject-type <type> --subject-source <type> --predicate <iri> --object <raw> --object-type <type> --object-source <type> [--no-normalize] [--json]",
    "  fide graph add --in <inputs> [--format <json|jsonl|fsd>] [--no-normalize] [--json] [--draft]",
    "  fide graph add --params '<json>' [--format <json|jsonl|fsd>] [--no-normalize] [--json] [--draft]",
    "  fide graph add --stdin [--format <json|jsonl|fsd>] [--no-normalize] [--json] [--draft]",
    "  fide graph validate --in <input> [--format <json|jsonl|fsd>] [--json]",
    "  fide graph root --in <input> [--format <json|jsonl|fsd>] [--json]",
    "  fide graph status",
    "  fide graph query sql --sql \"<query>\" [--json] [--allow-write]",
    "",
    "Notes:",
    "  - Normalization is ON by default for `graph add`.",
    "  - Default mode writes to .fide/statements/YYYY/MM/DD/<root>.jsonl.",
    "  - `--draft` writes a statement-doc markdown file to .fide/statement-drafts/YYYY/MM/DD/<root>.md.",
    "  - `--stdin`/`--in` can auto-detect json/jsonl/fsd, or use --format to force.",
    "  - `validate`/`root` accept statement-doc inputs and json/jsonl batches.",
    "  - `status` reports whether the current working directory has a .fide workspace.",
  ].join("\n");
}
