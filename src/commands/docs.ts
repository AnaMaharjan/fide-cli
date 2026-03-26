import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { hasFlag, parseArgs, shouldUseJsonOutput } from "../util/command/args.js";
import { defineCommand, renderCommandHelp } from "../util/command/command-metadata.js";
import { printJson } from "../util/command/io.js";
import { formatPretty } from "../util/command/pretty.js";
import { errorResponse, okResponse } from "../util/command/response.js";

type DocsMapping = {
  prefix: string;
  baseDir: string;
};

type ParsedDoc = {
  path: string;
  filePath: string;
  title: string | null;
  description: string | null;
  body: string;
};

export type DocsOutput = {
  ok: true;
  scope: "docs.v1";
  command: "fide docs";
  path: string;
  title: string | null;
  description: string | null;
  body: string;
  filePath: string;
};

export const docsCommand = defineCommand({
  surface: "docs",
  command: "fide docs",
  outputType: "DocsOutput",
  summary: "Resolve local docs pointers",
  usage: ["fide docs <path> [--pretty|-p]"],
  paramOrder: ["pretty"],
  params: {
    pretty: { kind: "boolean", shorthand: "-p", description: "Human-readable output" },
  },
});

const DOCS_MAPPINGS: DocsMapping[] = [
  {
    prefix: "/fcp",
    baseDir: resolve(process.cwd(), "packages/fide-context-protocol/docs"),
  },
  {
    prefix: "/fide-id",
    baseDir: resolve(process.cwd(), "packages/fide-id/docs"),
  },
  {
    prefix: "/vocabulary",
    baseDir: resolve(process.cwd(), "packages/fide-vocabulary/docs"),
  },
  {
    prefix: "/graph",
    baseDir: resolve(process.cwd(), "packages/graph/docs"),
  },
];

function docsHelp(): string {
  return renderCommandHelp({
    ...docsCommand,
    usage: ["fide docs <path> [--pretty|-p]"],
    examples: [
      "fide docs /fcp/specification/statements",
      "fide docs /vocabulary/definitions/network-resource",
    ],
  });
}

function parseFrontmatter(raw: string): { title: string | null; description: string | null; body: string } {
  if (!raw.startsWith("---\n")) {
    return { title: null, description: null, body: raw.trim() };
  }

  const end = raw.indexOf("\n---\n", 4);
  if (end < 0) {
    return { title: null, description: null, body: raw.trim() };
  }

  const frontmatter = raw.slice(4, end);
  const body = raw.slice(end + 5).trim();

  const titleMatch = frontmatter.match(/^title:\s*["']?(.+?)["']?\s*$/m);
  const descriptionMatch = frontmatter.match(/^description:\s*["']?(.+?)["']?\s*$/m);

  return {
    title: titleMatch?.[1] ?? null,
    description: descriptionMatch?.[1] ?? null,
    body,
  };
}

function resolveDocsFilePath(pathValue: string): string | null {
  const mapping = DOCS_MAPPINGS.find((entry) => pathValue === entry.prefix || pathValue.startsWith(`${entry.prefix}/`));
  if (!mapping) return null;

  const remainder = pathValue.slice(mapping.prefix.length).replace(/^\/+/, "");
  const filePath = resolve(mapping.baseDir, `${remainder || "index"}.mdx`);
  return filePath;
}

function readDoc(pathValue: string): ParsedDoc | null {
  const filePath = resolveDocsFilePath(pathValue);
  if (!filePath || !existsSync(filePath)) return null;

  const raw = readFileSync(filePath, "utf8");
  const parsed = parseFrontmatter(raw);

  return {
    path: pathValue,
    filePath,
    title: parsed.title,
    description: parsed.description,
    body: parsed.body,
  };
}

export async function runDocsCommand(args: string[]): Promise<number> {
  const { flags, positionals } = parseArgs(args);
  const useJson = shouldUseJsonOutput(flags);

  if (hasFlag(flags, "help") || hasFlag(flags, "-h")) {
    console.log(docsHelp());
    return 0;
  }

  const docsPath = positionals[0];
  if (!docsPath) {
    console.error("Missing docs path.");
    console.error(docsHelp());
    return 1;
  }

  const doc = readDoc(docsPath);
  if (!doc) {
    const payload = errorResponse("docs.v1", `Unknown docs path: ${docsPath}`, {
      supportedPrefixes: DOCS_MAPPINGS.map((entry) => entry.prefix),
    }, { command: "fide docs" });
    printJson(payload);
    return 1;
  }

  const payload = okResponse("docs.v1", {
    path: doc.path,
    title: doc.title,
    description: doc.description,
    body: doc.body,
    filePath: doc.filePath,
  }, {
    command: "fide docs",
  });
  if (useJson) {
    printJson(payload);
  } else {
    console.log(formatPretty("docs.v1", payload) ?? JSON.stringify(payload, null, 2));
  }
  return 0;
}
