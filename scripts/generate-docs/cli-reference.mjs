import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(SCRIPT_DIR, "..", "..");
const REPO_ROOT = resolve(PACKAGE_ROOT, "..", "..");
const CHECK_MODE = process.argv.includes("--check");
const DOCS_ROOT = resolve(PACKAGE_ROOT, "docs");
const CLI_BIN = resolve(PACKAGE_ROOT, "dist/bin/fide.js");
const GENERATED_PATHS = [
  "packages/cli/docs",
];

const DOC_PAGES = [
  { slug: "fide", tokens: [] },
  { slug: "graph", tokens: ["graph"] },
  { slug: "graph-write", tokens: ["graph", "write"], surfaces: ["graph.write", "graph.write.query"] },
  { slug: "graph-draft", tokens: ["graph", "draft"], surfaces: ["graph.draft"] },
  { slug: "graph-status", tokens: ["graph", "status"], surfaces: ["graph.status"] },
  { slug: "graph-sql", tokens: ["graph", "sql"], surfaces: ["graph.sql"] },
  { slug: "graph-build", tokens: ["graph", "build"], surfaces: ["graph.build"] },
  { slug: "graph-defs", tokens: ["graph", "defs"], surfaces: ["graph.defs"] },
  { slug: "auth", tokens: ["auth"] },
  { slug: "auth-login", tokens: ["auth", "login"], surfaces: ["auth.login"] },
  { slug: "auth-logout", tokens: ["auth", "logout"], surfaces: ["auth.logout"] },
  { slug: "auth-status", tokens: ["auth", "status"], surfaces: ["auth.status"] },
  { slug: "auth-whoami", tokens: ["auth", "whoami"], surfaces: ["auth.whoami"] },
  { slug: "auth-keys", tokens: ["auth", "keys"] },
  { slug: "auth-keys-list", tokens: ["auth", "keys", "list"], surfaces: ["auth.keys.list"] },
  { slug: "auth-keys-create", tokens: ["auth", "keys", "create"], surfaces: ["auth.keys.create"] },
  { slug: "auth-keys-revoke", tokens: ["auth", "keys", "revoke"], surfaces: ["auth.keys.revoke"] },
  { slug: "workspace", tokens: ["workspace"] },
  { slug: "workspace-list", tokens: ["workspace", "list"], surfaces: ["workspace.list"] },
  { slug: "workspace-get", tokens: ["workspace", "get"], surfaces: ["workspace.get"] },
  { slug: "workspace-members", tokens: ["workspace", "members"], surfaces: ["workspace.members"] },
  { slug: "workspace-members-add", tokens: ["workspace", "members", "add"], surfaces: ["workspace.members.add"] },
  { slug: "workspace-roles", tokens: ["workspace", "roles"] },
  { slug: "workspace-roles-grant", tokens: ["workspace", "roles", "grant"], surfaces: ["workspace.roles.grant"] },
  { slug: "workspace-roles-revoke", tokens: ["workspace", "roles", "revoke"], surfaces: ["workspace.roles.revoke"] },
  { slug: "workspace-service-accounts", tokens: ["workspace", "service-accounts"] },
  { slug: "workspace-service-accounts-create", tokens: ["workspace", "service-accounts", "create"], surfaces: ["workspace.service-accounts.create"] },
  { slug: "workspace-settings", tokens: ["workspace", "settings"] },
  { slug: "workspace-settings-get", tokens: ["workspace", "settings", "get"], surfaces: ["workspace.settings.get"] },
  { slug: "workspace-settings-set", tokens: ["workspace", "settings", "set"], surfaces: ["workspace.settings.set"] },
  { slug: "workspace-connections", tokens: ["workspace", "connections"] },
  { slug: "workspace-connections-list", tokens: ["workspace", "connections", "list"], surfaces: ["workspace.connections.list"] },
  { slug: "workspace-connections-create", tokens: ["workspace", "connections", "create"], surfaces: ["workspace.connections.create"] },
  { slug: "workspace-queries", tokens: ["workspace", "queries"] },
  { slug: "workspace-queries-list", tokens: ["workspace", "queries", "list"], surfaces: ["workspace.queries.list"] },
  { slug: "workspace-queries-get", tokens: ["workspace", "queries", "get"], surfaces: ["workspace.query.get"] },
  { slug: "docs", tokens: ["docs"] },
  { slug: "schema", tokens: ["schema"] },
];

const PAGE_GROUPS = [
  {
    title: "Top Level",
    pages: ["fide", "docs", "schema"],
  },
  {
    title: "Graph",
    pages: ["graph", "graph-write", "graph-draft", "graph-status", "graph-sql", "graph-build", "graph-defs"],
  },
  {
    title: "Auth",
    pages: ["auth", "auth-login", "auth-logout", "auth-status", "auth-whoami", "auth-keys", "auth-keys-list", "auth-keys-create", "auth-keys-revoke"],
  },
  {
    title: "Workspace",
    pages: [
      "workspace",
      "workspace-list",
      "workspace-get",
      "workspace-members",
      "workspace-members-add",
      "workspace-roles",
      "workspace-roles-grant",
      "workspace-roles-revoke",
      "workspace-service-accounts",
      "workspace-service-accounts-create",
      "workspace-settings",
      "workspace-settings-get",
      "workspace-settings-set",
      "workspace-connections",
      "workspace-connections-list",
      "workspace-connections-create",
      "workspace-queries",
      "workspace-queries-list",
      "workspace-queries-get",
    ],
  },
];

function run(command, args, options = {}) {
  const pretty = [command, ...args].join(" ");
  console.log(`> ${pretty}`);

  const result = spawnSync(command, args, {
    cwd: REPO_ROOT,
    env: process.env,
    ...options,
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }

  return result;
}

function runCapture(command, args) {
  const result = run(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  return result.stdout ?? "";
}

function runCaptureAllowFailure(command, args) {
  const pretty = [command, ...args].join(" ");
  console.log(`> ${pretty}`);

  const result = spawnSync(command, args, {
    cwd: REPO_ROOT,
    env: process.env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

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

    if (!currentTitle) continue;
    if (!line.trim()) continue;
    sections[currentTitle].push(line.trim());
  }

  return sections;
}

function parseNamedList(items) {
  return items
    .map((line) => {
      const trimmed = line.trim();
      const match = /^([a-z0-9-]+)\s+(.+)$/i.exec(trimmed);
      if (!match) return null;
      return {
        name: match[1],
        summary: match[2],
      };
    })
    .filter(Boolean);
}

function parseFlagLine(line) {
  const trimmed = line.trim();
  const match = /^(--[a-z0-9-]+)(?:,\s*(-[a-z]))?(?:\s+<([^>]+)>)?\s{2,}(.+)$/i.exec(trimmed);
  if (!match) return null;

  return {
    name: match[1],
    shorthand: match[2],
    type: match[3] ? match[3] : "boolean",
    description: match[4],
  };
}

function stripListMarker(line) {
  return line.trim().replace(/^-+\s*/, "");
}

function commandKey(tokens) {
  return tokens.join(" ");
}

function commandName(tokens) {
  return tokens.length === 0 ? "fide" : `fide ${tokens.join(" ")}`;
}

function readSchema(surface) {
  const output = runCapture("node", [CLI_BIN, "schema", surface]);
  const parsed = JSON.parse(output);
  return parsed.schema ?? parsed.data?.schema ?? null;
}

function readHelp(tokens) {
  const result = runCaptureAllowFailure("node", [CLI_BIN, ...tokens, "--help"]);
  if (result.status === 0) {
    return result.stdout;
  }
  return "";
}

function normalizeName(value) {
  return value.replace(/[^a-z0-9]/gi, "").toLowerCase();
}

function extractPositionalArguments(usageLines, schemas) {
  const argumentsByName = new Map();
  const schemaParams = schemas.flatMap((schema) => schema?.params ?? []);
  const usageCount = usageLines.length || 1;

  for (const line of usageLines) {
    for (const match of line.matchAll(/<([^>]+)>/g)) {
      const rawName = match[1];
      const before = line.slice(0, match.index).trimEnd();
      if (/--[a-z0-9-]+$/i.test(before)) continue;

      const normalizedRawName = normalizeName(rawName);
      const schemaParam = schemaParams.find((param) => normalizeName(param.name) === normalizedRawName);
      const existing = argumentsByName.get(rawName);
      argumentsByName.set(rawName, {
        name: `<${rawName}>`,
        type: existing?.type ?? (schemaParam?.enum?.length ? schemaParam.enum.join(" | ") : schemaParam?.type ?? "string"),
        required: ((existing?.requiredCount ?? 0) + 1) === usageCount,
        requiredCount: (existing?.requiredCount ?? 0) + 1,
        description: existing?.description ?? schemaParam?.description,
      });
    }
  }

  return [...argumentsByName.values()].map(({ requiredCount: _requiredCount, ...argument }) => ({
    ...argument,
    required: (_requiredCount ?? 0) === usageCount,
  }));
}

function mergeOptions(helpOptions, schemas, positionalArguments) {
  const merged = new Map();
  const stats = new Map();
  const positionalNames = new Set(positionalArguments.map((argument) => normalizeName(argument.name)));

  for (const option of helpOptions) {
    merged.set(option.name, {
      ...option,
      required: false,
    });
  }

  for (const schema of schemas) {
    if (!schema?.params) continue;
    for (const param of schema.params) {
      if (positionalNames.has(normalizeName(`<${param.name}>`))) {
        continue;
      }
      const key = `--${param.name}`;
      const existing = merged.get(key) ?? { name: key };
      const currentStats = stats.get(key) ?? { seenCount: 0, requiredCount: 0 };
      currentStats.seenCount += 1;
      currentStats.requiredCount += param.required ? 1 : 0;
      stats.set(key, currentStats);
      merged.set(key, {
        ...existing,
        type: existing.type ?? (param.enum?.length ? param.enum.join(" | ") : param.type ?? "string"),
        required: false,
        description: existing.description ?? param.description,
      });
    }
  }

  for (const [key, option] of merged.entries()) {
    const currentStats = stats.get(key);
    if (!currentStats) continue;
    option.required = currentStats.seenCount === schemas.length && currentStats.requiredCount === schemas.length;
  }

  return [...merged.values()];
}

function deriveDescription(tokens, usage) {
  if (tokens.length === 0) return "Command reference for the Fide CLI.";
  return usage[0] ?? `Reference for fide ${tokens.join(" ")}.`;
}

function parseExampleLine(line) {
  const trimmed = line.trim();
  const match = /^(.+?)(?:\s{2,}|\t+)([A-Z][\s\S]+)$/.exec(trimmed);
  if (!match) {
    return { command: trimmed };
  }
  return {
    command: match[1].trim(),
    description: match[2].trim(),
  };
}

function synthesizeUsage(page, schemas) {
  if (schemas.length === 0) {
    return page.tokens.length === 0 ? ["fide <group> [command] [flags]"] : [`fide ${page.tokens.join(" ")}`];
  }

  return schemas
    .map((schema) => schema.command)
    .filter(Boolean);
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function writeMdx(path, frontmatter, body) {
  writeFileSync(
    path,
    `---\n${Object.entries(frontmatter).map(([key, value]) => `${key}: ${JSON.stringify(value)}`).join("\n")}\n---\n\n${body}`,
    "utf8",
  );
}

function generateIndexPage(pageBySlug) {
  const lines = [
    "---",
    'title: "CLI"',
    'description: "Generated command reference for the Fide CLI."',
    "---",
    "",
    "This reference is generated from the CLI's live `--help` output and schema surfaces.",
    "",
  ];

  for (const group of PAGE_GROUPS) {
    lines.push(`## ${group.title}`);
    lines.push("");
    for (const slug of group.pages) {
      const page = pageBySlug.get(slug);
      if (!page) continue;
      lines.push(`- [\`${page.data.name}\`](./${slug})${page.data.summary ? ` - ${page.data.summary}` : ""}`);
    }
    lines.push("");
  }

  writeFileSync(resolve(DOCS_ROOT, "index.mdx"), `${lines.join("\n").trimEnd()}\n`, "utf8");
}

function generateDocs() {
  rmSync(DOCS_ROOT, { recursive: true, force: true });
  mkdirSync(DOCS_ROOT, { recursive: true });

  run("pnpm", ["--dir", "packages/cli", "run", "build"], { stdio: "inherit" });

  const docsByKey = new Map(DOC_PAGES.map((page) => [commandKey(page.tokens), page]));
  const docsBySurface = new Map(
    DOC_PAGES.flatMap((page) => (page.surfaces ?? []).map((surface) => [surface, page]))
  );
  const pageBySlug = new Map();
  const helpCache = new Map();

  for (const page of DOC_PAGES) {
    const helpText = readHelp(page.tokens);
    helpCache.set(commandKey(page.tokens), parseHelpSections(helpText));
  }

  for (const page of DOC_PAGES) {
    const sections = helpCache.get(commandKey(page.tokens)) ?? {};
    const parent = page.tokens.length > 0 ? helpCache.get(commandKey(page.tokens.slice(0, -1))) : null;
    const parentEntries = parseNamedList(parent?.Commands ?? parent?.Groups ?? []);
    const selfEntry = parentEntries.find((entry) => entry.name === page.tokens[page.tokens.length - 1]);
    const schemaEntries = (page.surfaces ?? [])
      .map((surface) => ({ surface, schema: readSchema(surface) }))
      .filter((entry) => Boolean(entry.schema));
    const schemas = schemaEntries.map((entry) => entry.schema);
    const usage = (sections.Usage?.length ?? 0) > 0 ? sections.Usage : synthesizeUsage(page, schemas);
    const helpOptions = (sections.Flags ?? []).map(parseFlagLine).filter(Boolean);
    const subcommandEntries = parseNamedList([...(sections.Commands ?? []), ...(sections.Groups ?? [])]);
    const argumentsList = subcommandEntries.length > 0 ? [] : extractPositionalArguments(usage, schemas);
    const mergedOptions = mergeOptions(helpOptions, schemas, argumentsList);
    const outputFields = [...new Map(
      schemas.flatMap((schema) =>
        Object.entries(schema.output ?? {}).map(([name, type]) => [
          name,
          {
            name,
            type,
            required: false,
          },
        ])
      )
    ).values()];
    let subcommands = subcommandEntries.map((entry) => {
      const child = docsByKey.get(commandKey([...page.tokens, entry.name]));
      return {
        name: entry.name,
        summary: entry.summary,
        href: child ? `./${child.slug}` : undefined,
      };
    });
    let subcommandsTitle;

    if (page.slug === "schema") {
      subcommandsTitle = "Surfaces";
      subcommands = (sections.Surfaces ?? []).map((surface) => {
        const child = docsBySurface.get(surface);
        return {
          name: surface,
          summary: child ? commandName(child.tokens) : undefined,
          href: child ? `./${child.slug}` : undefined,
        };
      });
    }

    const notes = [];
    for (const title of ["Notes", "Modes", "Target Resolution"]) {
      const items = sections[title] ?? [];
      if (items.length === 0) continue;
      notes.push({
        title,
        body: items.map(stripListMarker).join("\n"),
      });
    }

    if (page.surfaces?.length && page.slug === "schema") {
      notes.push({
        title: "Schema Surfaces",
        body: page.surfaces.join(", "),
      });
    }

    const data = {
      name: page.tokens.length === 0 ? "fide" : `fide ${page.tokens.join(" ")}`,
      summary: selfEntry?.summary ?? (page.tokens.length === 0 ? "Fide CLI" : undefined),
      description: deriveDescription(page.tokens, usage),
      usage,
      arguments: argumentsList,
      options: mergedOptions,
      outputFields,
      subcommandsTitle,
      subcommands,
      schemas: page.slug === "schema"
        ? []
        : schemaEntries.map(({ surface, schema }) => ({
            surface,
            command: schema.command,
            params: (schema.params ?? []).map((param) => ({
              name: `--${param.name}`,
              type: param.enum?.length ? param.enum.join(" | ") : param.type,
              required: param.required,
              description: param.description,
            })),
            outputFields: Object.entries(schema.output ?? {}).map(([name, type]) => ({
              name,
              type,
              required: false,
            })),
            json: JSON.stringify(schema, null, 2),
          })),
      examples: [...(sections.Examples ?? []), ...(sections.Workflows ?? [])].map(parseExampleLine),
      notes,
    };

    pageBySlug.set(page.slug, { ...page, data });
    writeMdx(
      resolve(DOCS_ROOT, `${page.slug}.mdx`),
      {
        title: data.name,
        description: data.description,
        full: true,
      },
      `import { CLICommandPageInteractive } from '@/components/cli-layout/interactive/cli-command-page-interactive';\n\n<CLICommandPageInteractive data={${JSON.stringify(data)}} />\n`,
    );
  }

  generateIndexPage(pageBySlug);

  const metaPages = ["index"];
  for (const group of PAGE_GROUPS) {
    metaPages.push(`--- ${group.title} ---`, ...group.pages);
  }
  writeJson(resolve(DOCS_ROOT, "meta.json"), {
    title: "CLI",
    description: "Generated CLI reference",
    root: true,
    defaultOpen: false,
    icon: "Terminal",
    pages: metaPages,
  });
}

generateDocs();

if (CHECK_MODE) {
  const statusOutput = runCapture("git", ["status", "--porcelain", "--", ...GENERATED_PATHS]).trim();
  if (statusOutput.length > 0) {
    console.error("Generated files are out of date. Run `pnpm --dir packages/cli run generate:docs` and commit the changes.");
    console.error(statusOutput);
    process.exit(1);
  }
  console.log("Generated files are up to date.");
}
