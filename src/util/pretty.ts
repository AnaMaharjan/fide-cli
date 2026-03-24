type PrettyRenderable = Record<string, unknown>;

function formatTopLevelStatus(payload: PrettyRenderable): string {
  const machine = payload.machine as {
    authConfigured: boolean;
    authValid: boolean;
    authSource: string | null;
    baseUrl: string | null;
    authError: string | null;
    authResolutionHint?: string | null;
  };
  const project = payload.project as {
    root: string;
    fideDir: string;
    source: string;
    settingsPresent: boolean;
  };
  const workspace = payload.workspace as {
    selected: string | null;
    source: string | null;
  };

  const machineLines = [
    "Machine",
    `  auth: ${machine.authConfigured ? (machine.authValid ? "configured and valid" : "configured but invalid") : "not configured"}`,
    ...(machine.authSource ? [`  source: ${machine.authSource}`] : []),
    ...(machine.baseUrl ? [`  base URL: ${machine.baseUrl}`] : []),
    ...(machine.authError ? [`  error: ${machine.authError}`] : []),
    ...(!machine.authConfigured && machine.authResolutionHint ? [`  hint: ${machine.authResolutionHint}`] : []),
  ];

  const projectLines = [
    "Project",
    `  root: ${project.root}`,
    `  .fide: ${project.fideDir}`,
    `  source: ${project.source}`,
    `  settings: ${project.settingsPresent ? "present" : "missing"}`,
  ];

  const workspaceLines = [
    "Workspace",
    ...(workspace.selected ? [`  selected: ${workspace.selected}`] : []),
    ...(workspace.source ? [`  source: ${workspace.source}`] : []),
  ];

  return [
    ...machineLines,
    "",
    ...projectLines,
    "",
    ...workspaceLines,
  ].join("\n");
}

function formatGraphStatus(payload: PrettyRenderable): string {
  const local = payload.local as null | {
    root: string;
    fideDir: string;
    statementsDirPresent: boolean;
    key: string | null;
    warnings?: string[];
    missing?: string[];
  };
  const graphs = Array.isArray(payload.graphs) ? (payload.graphs as Array<{
    key: string | null;
    graphStoreType: string;
    reachable?: boolean;
    missing?: string[];
  }>) : [];
  const queryCatalogs = Array.isArray(payload.queryCatalogs) ? (payload.queryCatalogs as Array<{
    key: string;
    catalogType: string;
    reachable?: boolean;
    missing?: string[];
  }>) : [];

  const lines: string[] = [];

  if (local) {
    lines.push("Local");
    lines.push(`  root: ${local.root}`);
    lines.push(`  .fide: ${local.fideDir}`);
    lines.push(`  statements: ${local.statementsDirPresent ? "present" : "missing"}`);
    if (local.key) lines.push(`  graph: ${local.key}`);
    if (Array.isArray(local.missing) && local.missing.length > 0) {
      lines.push(`  missing: ${local.missing.join(", ")}`);
    }
    if (Array.isArray(local.warnings) && local.warnings.length > 0) {
      lines.push(...local.warnings.map((warning) => `  warning: ${warning}`));
    }
  }

  if (graphs.length > 0) {
    if (lines.length > 0) lines.push("");
    lines.push("Graphs");
    for (const graph of graphs) {
      const status = graph.reachable === false
        ? "unreachable"
        : Array.isArray(graph.missing) && graph.missing.length > 0
          ? "incomplete"
          : "ready";
      lines.push(`  ${graph.key ?? "unnamed"}  ${graph.graphStoreType}  ${status}`);
      if (Array.isArray(graph.missing) && graph.missing.length > 0) {
        lines.push(`    missing: ${graph.missing.join(", ")}`);
      }
    }
  }

  if (queryCatalogs.length > 0) {
    if (lines.length > 0) lines.push("");
    lines.push("Query Stores");
    for (const store of queryCatalogs) {
      const status = store.reachable === false
        ? "unreachable"
        : Array.isArray(store.missing) && store.missing.length > 0
          ? "incomplete"
          : "ready";
      lines.push(`  ${store.key}  ${store.catalogType}  ${status}`);
      if (Array.isArray(store.missing) && store.missing.length > 0) {
        lines.push(`    missing: ${store.missing.join(", ")}`);
      }
    }
  }

  return lines.join("\n");
}

function formatGraphBuild(payload: PrettyRenderable): string {
  const lines: string[] = ["Graph Build"];
  const graphKey = typeof payload.key === "string" ? payload.key : null;
  const graphStoreType = typeof payload.graphStoreType === "string" ? payload.graphStoreType : null;
  const mode = typeof payload.mode === "string" ? payload.mode : null;
  const schema = typeof payload.schema === "string" ? payload.schema : null;
  const file = typeof payload.file === "string" ? payload.file : null;
  const queryCount = typeof payload.queryCount === "number" ? payload.queryCount : null;
  const statementCount = typeof payload.statementCount === "number" ? payload.statementCount : null;
  const statementsAdded = typeof payload.statementsAdded === "number" ? payload.statementsAdded : null;
  const stepCount = typeof payload.stepCount === "number" ? payload.stepCount : null;
  const lastRunAt = typeof payload.lastRunAt === "string" ? payload.lastRunAt : null;
  const warnings = Array.isArray(payload.warnings) ? (payload.warnings as string[]) : [];

  if (graphKey) lines.push(`  graph: ${graphKey}`);
  if (mode) lines.push(`  mode: ${mode}`);
  if (graphStoreType) lines.push(`  target: ${graphStoreType}`);
  if (schema) lines.push(`  schema: ${schema}`);
  if (file) lines.push(`  file: ${file}`);
  if (typeof statementsAdded === "number") lines.push(`  statements added: ${statementsAdded}`);
  if (typeof statementCount === "number") lines.push(`  statements: ${statementCount}`);
  if (typeof queryCount === "number") lines.push(`  queries: ${queryCount}`);
  if (typeof stepCount === "number") lines.push(`  steps: ${stepCount}`);
  if (lastRunAt) lines.push(`  last run: ${lastRunAt}`);
  if (warnings.length > 0) lines.push(...warnings.map((warning) => `  warning: ${warning}`));
  return lines.join("\n");
}

function formatWorkspaceList(payload: PrettyRenderable): string {
  const workspaces = Array.isArray(payload.workspaces) ? (payload.workspaces as Array<{
    id: string;
    name: string;
  }>) : [];
  const lines = ["Workspaces"];
  if (workspaces.length === 0) {
    lines.push("  none");
    return lines.join("\n");
  }
  for (const workspace of workspaces) {
    lines.push(`  ${workspace.id}  ${workspace.name}`);
  }
  return lines.join("\n");
}

function formatWorkspaceGet(payload: PrettyRenderable): string {
  const workspace = payload.workspace as {
    id: string;
    name: string;
    roles?: string[];
  };
  return [
    "Workspace",
    `  id: ${workspace.id}`,
    `  name: ${workspace.name}`,
    `  roles: ${Array.isArray(workspace.roles) && workspace.roles.length > 0 ? workspace.roles.join(", ") : "none"}`,
  ].join("\n");
}

function formatWorkspaceMembers(payload: PrettyRenderable): string {
  const members = Array.isArray(payload.members) ? (payload.members as Array<{
    userId: string;
    userType: string | null;
    roles: string[];
    permissions: string[];
  }>) : [];
  const lines = ["Members"];
  if (members.length === 0) {
    lines.push("  none");
    return lines.join("\n");
  }
  for (const member of members) {
    lines.push(`  ${member.userId}  ${member.userType ?? "unknown"}`);
    lines.push(`    roles: ${member.roles.length > 0 ? member.roles.join(", ") : "none"}`);
    lines.push(`    permissions: ${member.permissions.length > 0 ? member.permissions.join(", ") : "none"}`);
  }
  return lines.join("\n");
}

export function formatPretty(scope: string, payload: PrettyRenderable): string | null {
  switch (scope) {
    case "status.v1":
      return formatTopLevelStatus(payload);
    case "graph-status.v1":
      return formatGraphStatus(payload);
    case "graph-build.v1":
      return formatGraphBuild(payload);
    case "workspace-list.v1":
      return formatWorkspaceList(payload);
    case "workspace-get.v1":
      return formatWorkspaceGet(payload);
    case "workspace-members.v1":
      return formatWorkspaceMembers(payload);
    default:
      return null;
  }
}
