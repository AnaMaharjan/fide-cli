import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { createPgClient } from "@chris-test/db";
import { hasFlag, parseArgs } from "../../util/args.js";
import { renderHelp } from "../../util/help.js";
import { printJson } from "../../util/io.js";
import { listConfiguredGraphTargetKeys, resolveGraphTarget, type ResolvedGraphTarget } from "../../util/graph-target.js";
import { inspectSqliteGraph } from "../../util/sqlite.js";
import { getSqliteWarnings } from "../../util/sqlite-warning.js";

/**
 * Report whether the current working directory has a `.fide` directory.
 *
 * Agent-first: JSON is always the default output format, even in TTY.
 */
export async function runGraphStatus(args: string[] = []): Promise<number> {
  const { flags, positionals } = parseArgs(args);
  if (hasFlag(flags, "help") || hasFlag(flags, "-h")) {
    console.log(renderHelp({
      sections: [
        {
          title: "Usage",
          items: [
            "  fide graph status [target]",
            "  fide graph status --target <key-or-path>",
          ],
        },
        {
          title: "Flags",
          items: [
            "  --target <key-or-path>   Configured graph target key or jsonl directory path",
          ],
        },
        {
          title: "Notes",
          items: [
            "  - With no target, returns all configured graph targets.",
          ],
        },
      ],
    }));
    return 0;
  }

  if (positionals.length > 1) {
    throw new Error("`graph status` accepts at most one positional target.");
  }
  if (positionals.length === 1) {
    if (flags.has("target")) {
      throw new Error("Pass either a positional target or `--target`, not both.");
    }
    flags.set("target", positionals[0]);
  }

  async function statusForTarget(graphTarget: ResolvedGraphTarget) {
    if (graphTarget.type === "postgres") {
      if (!graphTarget.databaseUrl) {
        return {
          ok: true,
          target: "postgres",
          key: graphTarget.key,
          next: graphTarget.key ? {
            addHelpCommand: "fide graph add -h",
            addCommand: `fide graph add --target ${graphTarget.key} ...`,
          } : undefined,
          configuredFromSettings: graphTarget.configuredFromSettings,
          databaseUrlConfigured: false,
          databaseUrlSource: graphTarget.databaseUrlSource,
          databaseUrlEnv: graphTarget.databaseUrlEnv,
          schema: graphTarget.schema,
          statementsTable: graphTarget.statementsTable,
          reachable: false,
          missing: ["postgres.connection"],
        };
      }

      const expectedReferenceIdentifierColumns = [
        "identifier_fingerprint",
        "reference_identifier",
      ];
      const expectedStatementsColumns = [
        "statement_fingerprint",
        "subject_type",
        "subject_reference_type",
        "subject_fingerprint",
        "predicate_fingerprint",
        "object_type",
        "object_reference_type",
        "object_fingerprint",
        "created_at",
      ];
      const expectedStatementConstraints = [
        "chk_subject_protocol_self_sourced",
        "chk_object_protocol_self_sourced",
      ];

      const client = createPgClient(graphTarget.databaseUrl);
      try {
        await client`SELECT 1`;
        const schemaRows = await client<{ exists: boolean }[]>`
          SELECT EXISTS (
            SELECT 1
            FROM information_schema.schemata
            WHERE schema_name = ${graphTarget.schema}
          ) AS exists
        `;
        const schemaExists = Boolean(schemaRows[0]?.exists);
        const typeRows = await client<{ exists: boolean }[]>`
          SELECT EXISTS (
            SELECT 1
            FROM pg_type t
            INNER JOIN pg_namespace n ON t.typnamespace = n.oid
            WHERE t.typname = 'entity_type' AND n.nspname = ${graphTarget.schema}
          ) AS exists
        `;
        const entityTypeExists = Boolean(typeRows[0]?.exists);

        const tableRows = schemaExists
          ? await client<{ table_name: string }[]>`
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = ${graphTarget.schema}
              AND (
                table_name = 'reference_identifiers'
                OR table_name = ${graphTarget.statementsTable}
              )
            ORDER BY table_name
          `
          : [];
        const presentTables = new Set(tableRows.map((row) => row.table_name));

        const referenceIdentifierColumns = presentTables.has("reference_identifiers")
          ? (await client<{ column_name: string }[]>`
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = ${graphTarget.schema}
              AND table_name = 'reference_identifiers'
            ORDER BY ordinal_position
          `).map((row) => row.column_name)
          : [];
        const statementsColumns = presentTables.has(graphTarget.statementsTable)
          ? (await client<{ column_name: string }[]>`
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = ${graphTarget.schema}
              AND table_name = ${graphTarget.statementsTable}
            ORDER BY ordinal_position
          `).map((row) => row.column_name)
          : [];
        const statementConstraintRows = presentTables.has(graphTarget.statementsTable)
          ? await client<{ conname: string }[]>`
            SELECT c.conname
            FROM pg_constraint c
            INNER JOIN pg_class t ON c.conrelid = t.oid
            INNER JOIN pg_namespace n ON t.relnamespace = n.oid
            WHERE n.nspname = ${graphTarget.schema}
              AND t.relname = ${graphTarget.statementsTable}
              AND (
                c.conname = 'chk_subject_protocol_self_sourced'
                OR c.conname = 'chk_object_protocol_self_sourced'
              )
            ORDER BY c.conname
          `
          : [];
        const presentStatementConstraints = new Set(statementConstraintRows.map((row) => row.conname));

        const missing: string[] = [];
        if (!schemaExists) missing.push(`schema.${graphTarget.schema}`);
        if (!entityTypeExists) missing.push(`${graphTarget.schema}.entity_type`);
        if (!presentTables.has("reference_identifiers")) {
          missing.push(`${graphTarget.schema}.reference_identifiers`);
        }
        if (!presentTables.has(graphTarget.statementsTable)) {
          missing.push(`${graphTarget.schema}.${graphTarget.statementsTable}`);
        }

        const missingReferenceIdentifierColumns = expectedReferenceIdentifierColumns.filter((column) => !referenceIdentifierColumns.includes(column));
        const missingStatementsColumns = expectedStatementsColumns.filter((column) => !statementsColumns.includes(column));
        const missingStatementConstraints = expectedStatementConstraints.filter((name) => !presentStatementConstraints.has(name));
        missing.push(...missingReferenceIdentifierColumns.map((column) => `${graphTarget.schema}.reference_identifiers.${column}`));
        missing.push(...missingStatementsColumns.map((column) => `${graphTarget.schema}.${graphTarget.statementsTable}.${column}`));
        missing.push(...missingStatementConstraints.map((name) => `${graphTarget.schema}.${graphTarget.statementsTable}.${name}`));

        return {
          ok: true,
          target: "postgres",
          key: graphTarget.key,
          next: graphTarget.key ? {
            addHelpCommand: "fide graph add -h",
            addCommand: `fide graph add --target ${graphTarget.key} ...`,
          } : undefined,
          configured: true,
          configuredFromSettings: graphTarget.configuredFromSettings,
          databaseUrlConfigured: true,
          databaseUrlSource: graphTarget.databaseUrlSource,
          databaseUrlEnv: graphTarget.databaseUrlEnv,
          schema: graphTarget.schema,
          statementsTable: graphTarget.statementsTable,
          reachable: true,
          missing,
        };
      } catch (error) {
        return {
          ok: true,
          target: "postgres",
          key: graphTarget.key,
          next: graphTarget.key ? {
            addHelpCommand: "fide graph add -h",
            addCommand: `fide graph add --target ${graphTarget.key} ...`,
          } : undefined,
          configured: true,
          configuredFromSettings: graphTarget.configuredFromSettings,
          databaseUrlConfigured: true,
          databaseUrlSource: graphTarget.databaseUrlSource,
          databaseUrlEnv: graphTarget.databaseUrlEnv,
          schema: graphTarget.schema,
          statementsTable: graphTarget.statementsTable,
          reachable: false,
          missing: ["postgres.connection"],
          error: error instanceof Error ? error.message : String(error),
        };
      } finally {
        await client.end({ timeout: 1 });
      }
    }

    if (graphTarget.type === "sqlite") {
      const inspection = await inspectSqliteGraph(graphTarget.file);
      return {
        ok: true,
        target: "sqlite",
        key: graphTarget.key,
        configured: true,
        reachable: inspection.reachable,
        file: graphTarget.file,
        next: graphTarget.key ? {
          addHelpCommand: "fide graph add -h",
          addCommand: `fide graph add --target ${graphTarget.key} ...`,
        } : undefined,
        missing: inspection.missing,
        error: inspection.error,
        warnings: getSqliteWarnings(graphTarget.file, { gitignore: graphTarget.gitignore }),
      };
    }

    const { root, configuredFromSettings } = graphTarget;
    const fideDir = resolve(root, ".fide");
    const statementsDir = resolve(fideDir, "statements");

    const hasFide = existsSync(fideDir);
    const hasStatements = existsSync(statementsDir);

    const missing: string[] = [];
    if (!hasFide) missing.push(".fide");

    return {
      ok: true,
      target: "jsonl",
      configured: true,
      next: {
        addHelpCommand: "fide graph add -h",
        addCommand: "fide graph add ...",
      },
      root,
      dir: root,
      configuredFromSettings,
      fideDir,
      statementsDir,
      statementsDirPresent: hasStatements,
      missing,
      key: null,
    };
  }

  if (flags.has("target")) {
    printJson(await statusForTarget(resolveGraphTarget(flags)));
    return 0;
  }

  const configuredKeys = listConfiguredGraphTargetKeys();
  if (configuredKeys.length === 0) {
    printJson(await statusForTarget(resolveGraphTarget(flags)));
    return 0;
  }

  const targets = await Promise.all(configuredKeys.map(async (key) => {
    const targetFlags = new Map(flags);
    targetFlags.set("target", key);
    const target = resolveGraphTarget(targetFlags);
    const detailed = await statusForTarget(target);
    return {
      key,
      type: detailed.target,
      warnings: "warnings" in detailed ? detailed.warnings : undefined,
      next: {
        statusCommand: `fide graph status ${key}`,
        addHelpCommand: "fide graph add -h",
        addCommand: `fide graph add --target ${key} ...`,
      },
    };
  }));

  printJson({
    ok: true,
    targets,
  });
  return 0;
}
