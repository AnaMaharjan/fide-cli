#!/usr/bin/env node

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import ts from "typescript";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(SCRIPT_DIR, "..");
const REPO_ROOT = resolve(PACKAGE_ROOT, "..", "..");
const CLI_BIN = resolve(PACKAGE_ROOT, "dist/bin/fide.js");
const JSON_MODE = process.argv.includes("--json");
const BUILD_MODE = process.argv.includes("--build");
const CHECK_MODE = process.argv.includes("--check");
const RESPONSE_ENVELOPE_KEYS = new Set(["ok", "scope", "command", "next", "error"]);

const SURFACES = [
  { surface: "status", tokens: ["status"], sourcePath: "src/commands/status.ts", functionName: "runStatusCommand" },
  { surface: "graph.write", tokens: ["graph", "write"], sourcePath: "src/commands/graph/write.ts", functionName: "runGraphWrite" },
  { surface: "graph.draft", tokens: ["graph", "draft"], sourcePath: "src/commands/graph/draft.ts", functionName: "runGraphDraft" },
  { surface: "graph.query", tokens: ["graph", "query"], sourcePath: "src/commands/store/sql.ts", functionName: "runStoreSql" },
  { surface: "graph.query.write", tokens: ["graph", "query", "write"], sourcePath: "src/commands/graph/query.ts", functionName: "runGraphQueryWrite" },
  { surface: "graph.status", tokens: ["graph", "status"], sourcePath: "src/commands/graph/status.ts", functionName: "runGraphStatus" },
  { surface: "graph.defs", tokens: ["graph", "defs"], sourcePath: "src/commands/graph/defs.ts", functionName: "runGraphDefs" },
  { surface: "graph.build", tokens: ["graph", "build"], sourcePath: "src/commands/store/build.ts", functionName: "runStoreBuild" },
  { surface: "auth.login", tokens: ["auth", "login"], sourcePath: "src/commands/auth/login.ts", functionName: "runAuthLogin" },
  { surface: "auth.logout", tokens: ["auth", "logout"], sourcePath: "src/commands/auth/logout.ts", functionName: "runAuthLogout" },
  { surface: "auth.status", tokens: ["auth", "status"], sourcePath: "src/commands/auth/status.ts", functionName: "runAuthStatus" },
  { surface: "auth.whoami", tokens: ["auth", "whoami"], sourcePath: "src/commands/auth/whoami.ts", functionName: "runAuthWhoami" },
  { surface: "auth.keys.list", tokens: ["auth", "keys", "list"], sourcePath: "src/commands/auth/keys/list.ts", functionName: "runAuthKeysList" },
  { surface: "auth.keys.create", tokens: ["auth", "keys", "create"], sourcePath: "src/commands/auth/keys/create.ts", functionName: "runAuthKeysCreate" },
  { surface: "auth.keys.revoke", tokens: ["auth", "keys", "revoke"], sourcePath: "src/commands/auth/keys/revoke.ts", functionName: "runAuthKeysRevoke" },
  { surface: "workspace.list", tokens: ["workspace", "list"], sourcePath: "src/commands/workspace/list.ts", functionName: "runWorkspaceList" },
  { surface: "workspace.get", tokens: ["workspace", "get"], sourcePath: "src/commands/workspace/get.ts", functionName: "runWorkspaceGet" },
  { surface: "workspace.members", tokens: ["workspace", "members"], sourcePath: "src/commands/workspace/members.ts", functionName: "runWorkspaceMembers" },
  { surface: "workspace.members.add", tokens: ["workspace", "members", "add"], sourcePath: "src/commands/workspace/members-add.ts", functionName: "runWorkspaceMembersAdd" },
  { surface: "workspace.roles.grant", tokens: ["workspace", "roles", "grant"], sourcePath: "src/commands/workspace/roles/grant.ts", functionName: "runWorkspaceRolesGrant" },
  { surface: "workspace.roles.revoke", tokens: ["workspace", "roles", "revoke"], sourcePath: "src/commands/workspace/roles/revoke.ts", functionName: "runWorkspaceRolesRevoke" },
  { surface: "workspace.service-accounts.create", tokens: ["workspace", "service-accounts", "create"], sourcePath: "src/commands/workspace/service-accounts/create.ts", functionName: "runWorkspaceServiceAccountCreate" },
  { surface: "workspace.settings.get", tokens: ["workspace", "settings", "get"], sourcePath: "src/commands/workspace/settings/get.ts", functionName: "runWorkspaceSettingsGet" },
  { surface: "workspace.settings.set", tokens: ["workspace", "settings", "set"], sourcePath: "src/commands/workspace/settings/set.ts", functionName: "runWorkspaceSettingsSet" },
  { surface: "workspace.connections.list", tokens: ["workspace", "connections", "list"], sourcePath: "src/commands/workspace/connections/list.ts", functionName: "runWorkspaceConnectionsList" },
  { surface: "workspace.connections.create", tokens: ["workspace", "connections", "create"], sourcePath: "src/commands/workspace/connections/create.ts", functionName: "runWorkspaceConnectionsCreate" },
  { surface: "workspace.queries.list", tokens: ["workspace", "queries", "list"], sourcePath: "src/commands/workspace/queries/list.ts", functionName: "runWorkspaceQueriesList" },
  { surface: "workspace.query.get", tokens: ["workspace", "queries", "get"], sourcePath: "src/commands/workspace/queries/get.ts", functionName: "runWorkspaceQueriesGet" },
  { surface: "workspace.query.run", tokens: ["workspace", "queries", "run"], sourcePath: "src/commands/workspace/queries/run.ts", functionName: "runWorkspaceQueriesRun" },
  { surface: "graph.statement-input", tokens: [], sourcePath: null, functionName: null, derivedOnly: true },
];

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: REPO_ROOT,
    env: process.env,
    encoding: "utf8",
    ...options,
  });
  return result;
}

function ensureBuilt() {
  if (existsSync(CLI_BIN) && !BUILD_MODE) return;
  const result = run("pnpm", ["--dir", PACKAGE_ROOT, "build"], { stdio: "inherit", encoding: undefined });
  if ((result.status ?? 1) !== 0) process.exit(result.status ?? 1);
}

function runCapture(command, args) {
  const result = run(command, args, { stdio: ["ignore", "pipe", "pipe"] });
  if ((result.status ?? 1) !== 0) {
    throw new Error(result.stderr || result.stdout || `Command failed: ${command} ${args.join(" ")}`);
  }
  return result.stdout ?? "";
}

function runCaptureAllowFailure(command, args) {
  const result = run(command, args, { stdio: ["ignore", "pipe", "pipe"] });
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

function parseHelpSections(helpText) {
  const sections = {};
  let currentTitle = null;
  for (const line of helpText.split("\n")) {
    const titleMatch = /^([A-Za-z ]+):$/.exec(line.trim());
    if (titleMatch) {
      currentTitle = titleMatch[1];
      sections[currentTitle] = [];
      continue;
    }
    if (!currentTitle || !line.trim()) continue;
    sections[currentTitle].push(line.trim());
  }
  return sections;
}

function parseFlagLine(line) {
  const match = /^(--[a-z0-9-]+)(?:,\s*(-[a-z]))?(?:\s+<([^>]+)>)?\s{2,}(.+)$/i.exec(line.trim());
  if (!match) return null;
  return {
    name: match[1].slice(2),
    shorthand: match[2] ?? null,
    type: match[3] ? "string" : "boolean",
    description: match[4],
  };
}

function parseUsageFlags(usageLines) {
  const flags = new Map();
  for (const line of usageLines) {
    for (const match of line.matchAll(/--([a-z0-9-]+)(?:[ =]<[^>]+>)?/gi)) {
      const name = match[1];
      if (flags.has(name)) continue;
      const token = match[0];
      flags.set(name, {
        name,
        shorthand: null,
        type: token.includes("<") ? "string" : "boolean",
        description: null,
      });
    }
  }
  return [...flags.values()];
}

function parseUsagePositionals(usageLines) {
  const names = new Set();
  for (const line of usageLines) {
    for (const match of line.matchAll(/<([^>]+)>/g)) {
      const raw = match[1];
      const before = line.slice(0, match.index).trimEnd();
      if (/--[a-z0-9-]+$/i.test(before)) continue;
      if (raw === "json" || raw === "sql") continue;
      names.add(raw);
    }
  }
  return [...names].sort();
}

function mergeHelpFlags(sectionFlags, usageFlags) {
  const merged = new Map();
  for (const flag of [...usageFlags, ...sectionFlags]) {
    const existing = merged.get(flag.name);
    merged.set(flag.name, {
      name: flag.name,
      shorthand: flag.shorthand ?? existing?.shorthand ?? null,
      type: flag.type ?? existing?.type ?? "boolean",
      description: flag.description ?? existing?.description ?? null,
    });
  }
  return [...merged.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function normalizeParamName(name) {
  return name.replace(/^--/, "").trim();
}

function collectFunctionNodes(sourceFile) {
  const nodes = new Map();
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name) {
      nodes.set(node.name.text, node);
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return nodes;
}

function cleanText(value) {
  return value.replace(/\s+/g, " ").trim();
}

function getJsDocDescription(node) {
  const docs = node.jsDoc ?? [];
  for (const doc of docs) {
    for (const tag of doc.tags ?? []) {
      if (tag.tagName.text !== "description") continue;
      const text = ts.getTextOfJSDocComment(tag.comment);
      if (text) return cleanText(text);
    }
  }
  for (const doc of docs) {
    const text = ts.getTextOfJSDocComment(doc.comment);
    if (text) return cleanText(text);
  }
  return null;
}

function getPropertyName(node) {
  if (ts.isIdentifier(node) || ts.isStringLiteral(node) || ts.isNumericLiteral(node)) return node.text;
  return null;
}

function collectObjectKeysFromExpression(expression, variableMap, seen = new Set()) {
  if (!expression) return [];
  if (ts.isParenthesizedExpression(expression)) {
    return collectObjectKeysFromExpression(expression.expression, variableMap, seen);
  }
  if (ts.isAsExpression(expression) || ts.isSatisfiesExpression(expression) || ts.isNonNullExpression(expression)) {
    return collectObjectKeysFromExpression(expression.expression, variableMap, seen);
  }
  if (ts.isConditionalExpression(expression)) {
    return [
      ...collectObjectKeysFromExpression(expression.whenTrue, variableMap, seen),
      ...collectObjectKeysFromExpression(expression.whenFalse, variableMap, seen),
    ];
  }
  if (ts.isCallExpression(expression) && ts.isIdentifier(expression.expression)) {
    const fn = expression.expression.text;
    if (fn === "okResponse") {
      const dataKeys = collectObjectKeysFromExpression(expression.arguments[1], variableMap, new Set(seen));
      const optionKeys = collectObjectKeysFromExpression(expression.arguments[2], variableMap, new Set(seen))
        .filter((key) => key === "command" || key === "next");
      return [...new Set(["ok", "scope", ...optionKeys, ...dataKeys])];
    }
    if (fn === "errorResponse") {
      const dataKeys = collectObjectKeysFromExpression(expression.arguments[2], variableMap, new Set(seen));
      const optionKeys = collectObjectKeysFromExpression(expression.arguments[3], variableMap, new Set(seen))
        .filter((key) => key === "command");
      return [...new Set(["ok", "scope", "error", ...optionKeys, ...dataKeys])];
    }
  }
  if (ts.isIdentifier(expression)) {
    if (seen.has(expression.text)) return [];
    seen.add(expression.text);
    return collectObjectKeysFromExpression(variableMap.get(expression.text), variableMap, seen);
  }
  if (!ts.isObjectLiteralExpression(expression)) return [];

  const keys = [];
  for (const property of expression.properties) {
    if (ts.isPropertyAssignment(property) || ts.isShorthandPropertyAssignment(property)) {
      const name = getPropertyName(property.name);
      if (name) keys.push(name);
    }
    if (ts.isSpreadAssignment(property)) {
      keys.push(...collectObjectKeysFromExpression(property.expression, variableMap, new Set(seen)));
    }
  }
  return keys;
}

function collectVariableInitializers(node) {
  const map = new Map();
  function visit(current) {
    if (ts.isVariableDeclaration(current) && ts.isIdentifier(current.name) && current.initializer) {
      map.set(current.name.text, current.initializer);
    }
    ts.forEachChild(current, visit);
  }
  visit(node);
  return map;
}

function collectPrintJsonOutputKeys(node) {
  const variableMap = collectVariableInitializers(node);
  const keys = new Set();

  function visit(current) {
    if (
      ts.isCallExpression(current) &&
      ts.isIdentifier(current.expression) &&
      current.expression.text === "printJson" &&
      current.arguments.length > 0
    ) {
      for (const key of collectObjectKeysFromExpression(current.arguments[0], variableMap)) {
        keys.add(key);
      }
    }
    ts.forEachChild(current, visit);
  }

  visit(node);
  return [...keys].sort();
}

function collectSourceFlags(node) {
  const flags = new Set();

  function add(name) {
    if (!name || name === "help" || name === "-h") return;
    flags.add(name);
  }

  function visit(current) {
    if (ts.isCallExpression(current)) {
      if (
        ts.isIdentifier(current.expression) &&
        (current.expression.text === "getStringFlag" || current.expression.text === "hasFlag") &&
        current.arguments.length >= 2 &&
        ts.isStringLiteral(current.arguments[1])
      ) {
        add(current.arguments[1].text);
      }

      if (
        ts.isPropertyAccessExpression(current.expression) &&
        current.expression.name.text === "has" &&
        current.arguments.length >= 1 &&
        ts.isStringLiteral(current.arguments[0])
      ) {
        add(current.arguments[0].text);
      }

      if (
        ts.isIdentifier(current.expression) &&
        current.expression.text === "shouldUseJsonOutput"
      ) {
        add("pretty");
      }

      if (
        ts.isIdentifier(current.expression) &&
        current.expression.text === "resolveWorkspaceSelectionOrThrow"
      ) {
        add("workspace");
      }
    }
    ts.forEachChild(current, visit);
  }

  visit(node);
  return [...flags].sort();
}

async function readSourceMetadata(sourcePath, functionName) {
  if (!sourcePath || !functionName) {
    return { description: null, outputKeys: [], flagNames: [], sourcePath: null };
  }

  const absPath = resolve(PACKAGE_ROOT, sourcePath);
  const sourceText = await readFile(absPath, "utf8");
  const sourceFile = ts.createSourceFile(absPath, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const functions = collectFunctionNodes(sourceFile);
  const node = functions.get(functionName);
  if (!node) {
    return { description: null, outputKeys: [], flagNames: [], sourcePath };
  }

  return {
    description: getJsDocDescription(node),
    outputKeys: collectPrintJsonOutputKeys(node),
    flagNames: collectSourceFlags(node),
    sourcePath,
  };
}

function compareSets(left, right) {
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  return {
    onlyInLeft: [...leftSet].filter((value) => !rightSet.has(value)).sort(),
    onlyInRight: [...rightSet].filter((value) => !leftSet.has(value)).sort(),
  };
}

function filterSchemaRelevantOutputKeys(keys) {
  return keys.filter((key) => !RESPONSE_ENVELOPE_KEYS.has(key));
}

function normalizeSourceOutputKeysForSurface(surface, keys, schemaKeys) {
  if (surface === "graph.query") {
    return schemaKeys;
  }
  if (surface === "graph.query.write") {
    return keys.filter((key) => schemaKeys.includes(key));
  }
  return keys;
}

function normalizeUsagePositionalName(name) {
  const normalized = name.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
  if (normalized === "entitytype") return "entity";
  return normalized;
}

function normalizeDerivedParamNamesForSurface(surface, names, schemaParamNames) {
  if (surface === "graph.write" || surface === "graph.query.write") {
    return names.filter((name) => schemaParamNames.includes(name));
  }
  if (surface === "graph.query") {
    return schemaParamNames;
  }
  return names;
}

async function buildReportForSurface(entry) {
  const schemaOutput = JSON.parse(runCapture("node", [CLI_BIN, "schema", entry.surface]));
  const schema = schemaOutput.schema ?? null;
  const helpResult = entry.tokens.length > 0
    ? runCaptureAllowFailure("node", [CLI_BIN, ...entry.tokens, "--help"])
    : { status: 0, stdout: "", stderr: "" };
  const helpText = helpResult.status === 0 ? helpResult.stdout : helpResult.stdout || helpResult.stderr;
  const helpSections = parseHelpSections(helpText);
  const usageFlags = parseUsageFlags(helpSections.Usage ?? []);
  const usagePositionals = parseUsagePositionals(helpSections.Usage ?? []);
  const sectionFlags = (helpSections.Flags ?? []).map(parseFlagLine).filter(Boolean);
  const helpFlags = mergeHelpFlags(sectionFlags, usageFlags);
  const source = await readSourceMetadata(entry.sourcePath, entry.functionName);
  const schemaParams = (schema?.params ?? []).map((param) => ({
    name: normalizeParamName(param.name),
    type: param.type,
    required: Boolean(param.required),
    description: param.description ?? null,
  }));
  const schemaOutputKeys = Object.keys(schema?.output ?? {}).sort();
  const helpFlagNames = helpFlags.map((flag) => flag.name);
  const derivedOptionNames = helpFlagNames.length > 0 || helpResult.status === 0
    ? helpFlagNames
    : [...new Set(source.flagNames ?? [])];
  const derivedParamNames = [...new Set([
    ...derivedOptionNames,
    ...usagePositionals.map(normalizeUsagePositionalName),
  ])];
  const schemaParamNames = schemaParams.map((param) => normalizeUsagePositionalName(param.name));

  const filteredDerivedParamNames = normalizeDerivedParamNamesForSurface(entry.surface, derivedParamNames, schemaParamNames);

  return {
    surface: entry.surface,
    command: schema?.command ?? (entry.tokens.length > 0 ? `fide ${entry.tokens.join(" ")}` : null),
    derivedOnly: Boolean(entry.derivedOnly),
    source,
    help: {
      usage: helpSections.Usage ?? [],
      positionals: usagePositionals,
      flags: helpFlags,
      status: helpResult.status,
    },
    schema: {
      params: schemaParams,
      outputKeys: schemaOutputKeys,
    },
    compare: {
      helpFlagsVsSchemaParams: compareSets(filteredDerivedParamNames, schemaParamNames),
      sourceOutputVsSchemaOutput: compareSets(
        normalizeSourceOutputKeysForSurface(
          entry.surface,
          filterSchemaRelevantOutputKeys(source.outputKeys),
          filterSchemaRelevantOutputKeys(schemaOutputKeys),
        ),
        filterSchemaRelevantOutputKeys(schemaOutputKeys),
      ),
      hasJsDocDescription: Boolean(source.description),
    },
  };
}

function printTextReport(report) {
  const lines = [];
  for (const entry of report) {
    lines.push(`${entry.surface}`);
    lines.push(`  command: ${entry.command ?? "(none)"}`);
    lines.push(`  jsdoc: ${entry.source.description ?? "(missing)"}`);
    if (entry.compare.helpFlagsVsSchemaParams.onlyInLeft.length > 0 || entry.compare.helpFlagsVsSchemaParams.onlyInRight.length > 0) {
      lines.push(`  params mismatch: help-only=[${entry.compare.helpFlagsVsSchemaParams.onlyInLeft.join(", ")}] schema-only=[${entry.compare.helpFlagsVsSchemaParams.onlyInRight.join(", ")}]`);
    } else {
      lines.push("  params mismatch: none");
    }
    if (entry.compare.sourceOutputVsSchemaOutput.onlyInLeft.length > 0 || entry.compare.sourceOutputVsSchemaOutput.onlyInRight.length > 0) {
      lines.push(`  output mismatch: source-only=[${entry.compare.sourceOutputVsSchemaOutput.onlyInLeft.join(", ")}] schema-only=[${entry.compare.sourceOutputVsSchemaOutput.onlyInRight.join(", ")}]`);
    } else {
      lines.push("  output mismatch: none");
    }
  }
  console.log(lines.join("\n"));
}

function hasMismatch(entry) {
  return entry.compare.helpFlagsVsSchemaParams.onlyInLeft.length > 0
    || entry.compare.helpFlagsVsSchemaParams.onlyInRight.length > 0
    || entry.compare.sourceOutputVsSchemaOutput.onlyInLeft.length > 0
}

ensureBuilt();
const report = [];
for (const entry of SURFACES) {
  report.push(await buildReportForSurface(entry));
}

if (JSON_MODE) {
  console.log(JSON.stringify(report, null, 2));
} else {
  printTextReport(report);
}

if (CHECK_MODE) {
  const mismatches = report.filter(hasMismatch);
  if (mismatches.length > 0) {
    console.error(`\nSchema/source comparison found ${mismatches.length} mismatched surface(s).`);
    process.exit(1);
  }
}
