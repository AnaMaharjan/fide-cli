import { existsSync, readdirSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { readJsonFile, resolveFideContext, resolveGraphConfigPath, resolveGraphsDir } from "./fide-dir.js";
import type { GraphStoreSettings } from "./project-settings.js";

export type LocalProjectGraphRecord = GraphStoreSettings;
export type HostedWorkspaceGraphInput = {
  type: "postgres" | "sqlite" | "fide-jsonl";
};

export type HostedWorkspaceGraphRecord = HostedWorkspaceGraphInput & {
  graphKey: string;
};

export type HostedWorkspaceGraphSyncOperation =
  | {
      graphKey: string;
      status: "create";
      localGraph: HostedWorkspaceGraphInput;
      remoteGraph: null;
    }
  | {
      graphKey: string;
      status: "update";
      localGraph: HostedWorkspaceGraphInput;
      remoteGraph: HostedWorkspaceGraphInput;
    }
  | {
      graphKey: string;
      status: "unchanged";
      localGraph: HostedWorkspaceGraphInput;
      remoteGraph: HostedWorkspaceGraphInput;
    }
  | {
      graphKey: string;
      status: "remote_only";
      localGraph: null;
      remoteGraph: HostedWorkspaceGraphInput;
    };

function canonicalizeValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => canonicalizeValue(entry));
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, canonicalizeValue(entry)] as const);
    return Object.fromEntries(entries);
  }
  return value;
}

export function normalizeHostedWorkspaceGraphInput(graph: HostedWorkspaceGraphInput): HostedWorkspaceGraphInput {
  return { type: canonicalizeValue(graph.type) as HostedWorkspaceGraphInput["type"] };
}

export function hostedWorkspaceGraphsEqual(
  left: HostedWorkspaceGraphInput,
  right: HostedWorkspaceGraphInput,
): boolean {
  return JSON.stringify(normalizeHostedWorkspaceGraphInput(left))
    === JSON.stringify(normalizeHostedWorkspaceGraphInput(right));
}

export function readLocalProjectGraph(graphKey: string, root: string = process.cwd()): LocalProjectGraphRecord | null {
  return readJsonFile<LocalProjectGraphRecord>(resolveGraphConfigPath(graphKey, root));
}

export function listLocalProjectGraphs(root: string = process.cwd()): {
  root: string;
  graphs: Array<{ graphKey: string; graph: LocalProjectGraphRecord }>;
} {
  const graphsDir = resolveGraphsDir(root);
  const fide = resolveFideContext(root);
  if (!existsSync(graphsDir)) {
    return { root: fide.root, graphs: [] };
  }

  const graphs = readdirSync(graphsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => {
      const graph = readLocalProjectGraph(entry.name, root);
      return graph ? [{ graphKey: entry.name, graph }] : [];
    });

  return {
    root: fide.root,
    graphs,
  };
}

export async function writeLocalProjectGraph(
  graphKey: string,
  graph: LocalProjectGraphRecord,
  root: string = process.cwd(),
): Promise<string> {
  const configPath = resolveGraphConfigPath(graphKey, root);
  await mkdir(dirname(configPath), { recursive: true });
  await writeFile(configPath, `${JSON.stringify(graph, null, 2)}\n`, "utf8");
  return configPath;
}

export function projectLocalGraphToHostedGraph(
  graphKey: string,
  graph: LocalProjectGraphRecord | null | undefined,
): HostedWorkspaceGraphRecord | null {
  if (!graph || typeof graph !== "object") {
    return null;
  }
  const connection = graph.connection;
  const type = connection && typeof connection === "object" && !Array.isArray(connection)
    ? (connection as { type?: unknown }).type
    : ("type" in graph ? graph.type : undefined);
  if (type !== "postgres" && type !== "sqlite" && type !== "fide-jsonl") {
    return null;
  }
  return {
    graphKey,
    ...normalizeHostedWorkspaceGraphInput({ type }),
    type,
  };
}

export function projectLocalGraphsToHostedGraphs(
  graphs: Record<string, LocalProjectGraphRecord> | null | undefined,
): Map<string, HostedWorkspaceGraphInput> {
  const result = new Map<string, HostedWorkspaceGraphInput>();
  if (!graphs || typeof graphs !== "object" || Array.isArray(graphs)) {
    return result;
  }

  for (const [graphKey, graph] of Object.entries(graphs)) {
    const projected = projectLocalGraphToHostedGraph(graphKey, graph);
    if (!projected) {
      continue;
    }
    result.set(graphKey, normalizeHostedWorkspaceGraphInput(projected));
  }

  return result;
}

export function planHostedWorkspaceGraphSync(input: {
  localGraphs: ReadonlyMap<string, HostedWorkspaceGraphInput> | Map<string, HostedWorkspaceGraphInput>;
  remoteGraphs: Iterable<HostedWorkspaceGraphRecord>;
}): HostedWorkspaceGraphSyncOperation[] {
  const remoteGraphMap = new Map<string, HostedWorkspaceGraphInput>();
  const remoteGraphOrder: string[] = [];

  for (const remoteGraph of input.remoteGraphs) {
    remoteGraphMap.set(remoteGraph.graphKey, normalizeHostedWorkspaceGraphInput(remoteGraph));
    remoteGraphOrder.push(remoteGraph.graphKey);
  }

  const operations: HostedWorkspaceGraphSyncOperation[] = [];

  for (const [graphKey, localGraph] of input.localGraphs.entries()) {
    const normalizedLocalGraph = normalizeHostedWorkspaceGraphInput(localGraph);
    const remoteGraph = remoteGraphMap.get(graphKey) ?? null;
    if (!remoteGraph) {
      operations.push({
        graphKey,
        status: "create",
        localGraph: normalizedLocalGraph,
        remoteGraph: null,
      });
      continue;
    }
    if (hostedWorkspaceGraphsEqual(normalizedLocalGraph, remoteGraph)) {
      operations.push({
        graphKey,
        status: "unchanged",
        localGraph: normalizedLocalGraph,
        remoteGraph,
      });
      continue;
    }
    operations.push({
      graphKey,
      status: "update",
      localGraph: normalizedLocalGraph,
      remoteGraph,
    });
  }

  for (const graphKey of remoteGraphOrder) {
    if (input.localGraphs.has(graphKey)) {
      continue;
    }
    const remoteGraph = remoteGraphMap.get(graphKey);
    if (!remoteGraph) {
      continue;
    }
    operations.push({
      graphKey,
      status: "remote_only",
      localGraph: null,
      remoteGraph,
    });
  }

  return operations;
}
