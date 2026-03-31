type PrettyRenderable = Record<string, unknown>;

function toDisplayLabel(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
}

function formatScalar(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") return String(value);
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  return JSON.stringify(value);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function renderValue(label: string, value: unknown, indent: number): string[] {
  const prefix = " ".repeat(indent);
  const displayLabel = toDisplayLabel(label);

  if (Array.isArray(value)) {
    if (value.length === 0) return [`${prefix}${displayLabel}: []`];
    const allScalars = value.every((entry) => !Array.isArray(entry) && !isPlainObject(entry));
    if (allScalars) {
      return [`${prefix}${displayLabel}: ${value.map((entry) => formatScalar(entry)).join(", ")}`];
    }
    const lines = [`${prefix}${displayLabel}:`];
    for (const entry of value) {
      if (Array.isArray(entry) || isPlainObject(entry)) {
        lines.push(`${prefix}  -`);
        lines.push(...renderUnknown(entry, indent + 4));
      } else {
        lines.push(`${prefix}  - ${formatScalar(entry)}`);
      }
    }
    return lines;
  }

  if (isPlainObject(value)) {
    const entries = Object.entries(value);
    if (entries.length === 0) return [`${prefix}${displayLabel}: {}`];
    return [
      `${prefix}${displayLabel}:`,
      ...entries.flatMap(([childKey, childValue]) => renderValue(childKey, childValue, indent + 2)),
    ];
  }

  return [`${prefix}${displayLabel}: ${formatScalar(value)}`];
}

function renderUnknown(value: unknown, indent = 0): string[] {
  if (Array.isArray(value)) {
    if (value.length === 0) return [`${" ".repeat(indent)}[]`];
    return value.flatMap((entry) => {
      const prefix = " ".repeat(indent);
      if (Array.isArray(entry) || isPlainObject(entry)) {
        return [`${prefix}-`, ...renderUnknown(entry, indent + 2)];
      }
      return [`${prefix}- ${formatScalar(entry)}`];
    });
  }

  if (isPlainObject(value)) {
    return Object.entries(value).flatMap(([key, entry]) => renderValue(key, entry, indent));
  }

  return [`${" ".repeat(indent)}${formatScalar(value)}`];
}

function renderGenericPretty(payload: PrettyRenderable): string {
  return renderUnknown(payload).join("\n");
}

function formatTopLevelStatus(payload: PrettyRenderable): string {
  const machine = payload.machine as {
    authConfigured: boolean;
    authValid: boolean;
    authSource: string | null;
    baseUrl: string | null;
    authError: string | null;
    authResolutionHint?: string | null;
    env_defaults?: {
      FIDE_ACCOUNT_ID?: string;
      FIDE_API_BASE_URL?: string;
      FIDE_SYNC_BASE_URL?: string;
      FIDE_WORKSPACE_URL?: string;
    };
  };
  const project = payload.project as {
    root: string;
    fideDir: string;
    source: string;
    settingsPresent: boolean;
    settings?: {
      account?: {
        id?: string;
        name?: string;
      };
      workspace?: {
        id?: string;
        name?: string;
      };
    };
  };
  const workspace = payload.workspace as {
    selected: string | null;
    source: string | null;
  };
  const sync = payload.sync as null | {
    pid: number;
    status: string;
    syncBaseUrl?: string;
    syncEndpoint?: string | null;
    projectFideRoots?: string[];
    error?: string | null;
  };

  const machineLines = [
    "Machine",
    `  auth: ${machine.authConfigured ? (machine.authValid ? "configured and valid" : "configured but invalid") : "not configured"}`,
    ...(machine.authSource ? [`  source: ${machine.authSource}`] : []),
    ...(machine.baseUrl ? [`  base URL: ${machine.baseUrl}`] : []),
    ...(machine.env_defaults?.FIDE_ACCOUNT_ID ? [`  FIDE_ACCOUNT_ID: ${machine.env_defaults.FIDE_ACCOUNT_ID}`] : []),
    ...(machine.env_defaults?.FIDE_API_BASE_URL ? [`  FIDE_API_BASE_URL: ${machine.env_defaults.FIDE_API_BASE_URL}`] : []),
    ...(machine.env_defaults?.FIDE_SYNC_BASE_URL ? [`  FIDE_SYNC_BASE_URL: ${machine.env_defaults.FIDE_SYNC_BASE_URL}`] : []),
    ...(machine.env_defaults?.FIDE_WORKSPACE_URL ? [`  FIDE_WORKSPACE_URL: ${machine.env_defaults.FIDE_WORKSPACE_URL}`] : []),
    ...(machine.authError ? [`  error: ${machine.authError}`] : []),
    ...(!machine.authConfigured && machine.authResolutionHint ? [`  hint: ${machine.authResolutionHint}`] : []),
  ];

  const projectLines = [
    "Project",
    `  root: ${project.root}`,
    `  .fide: ${project.fideDir}`,
    `  source: ${project.source}`,
    `  settings: ${project.settingsPresent ? "present" : "missing"}`,
    ...(project.settings?.account?.id ? [`  account: ${project.settings.account.id}${project.settings.account.name ? ` (${project.settings.account.name})` : ""}`] : []),
    ...(project.settings?.workspace?.id ? [`  workspace: ${project.settings.workspace.id}${project.settings.workspace.name ? ` (${project.settings.workspace.name})` : ""}`] : []),
  ];

  const workspaceLines = [
    "Workspace",
    ...(workspace.selected ? [`  selected: ${workspace.selected}`] : []),
    ...(workspace.source ? [`  source: ${workspace.source}`] : []),
  ];

  const syncLines = sync ? [
    "Sync",
    `  status: ${sync.status}`,
    `  pid: ${sync.pid}`,
    ...(sync.syncBaseUrl ? [`  base URL: ${sync.syncBaseUrl}`] : []),
    ...(sync.syncEndpoint ? [`  endpoint: ${sync.syncEndpoint}`] : []),
    ...(Array.isArray(sync.projectFideRoots) && sync.projectFideRoots.length > 0
      ? sync.projectFideRoots.map((root) => `  project .fide: ${root}`)
      : []),
    ...(sync.error ? [`  error: ${sync.error}`] : []),
  ] : [];

  return [
    ...machineLines,
    "",
    ...projectLines,
    "",
    ...workspaceLines,
    ...(syncLines.length > 0 ? ["", ...syncLines] : []),
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
    accountId: string;
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
    lines.push(`  ${member.accountId}  ${member.userType ?? "unknown"}`);
    lines.push(`    roles: ${member.roles.length > 0 ? member.roles.join(", ") : "none"}`);
    lines.push(`    permissions: ${member.permissions.length > 0 ? member.permissions.join(", ") : "none"}`);
  }
  return lines.join("\n");
}

function formatStatementsGuide(payload: PrettyRenderable): string {
  const statementRules = Array.isArray(payload.statementRules)
    ? payload.statementRules as Array<{ id?: string; description?: string }>
    : [];
  const entities = Array.isArray(payload.entities)
    ? payload.entities as Array<{ name?: string; description?: string }>
    : [];
  const entity = payload.entity && isPlainObject(payload.entity)
    ? payload.entity as Record<string, unknown>
    : null;

  const lines: string[] = [];

  if (statementRules.length > 0) {
    lines.push("Statement Rules");
    for (const rule of statementRules) {
      const description = typeof rule.description === "string" ? rule.description : "";
      const id = typeof rule.id === "string" ? rule.id : null;
      lines.push(`  - ${description}${id ? ` (${id})` : ""}`);
    }
  }

  if (entities.length > 0) {
    if (lines.length > 0) lines.push("");
    lines.push("Entity Types");
    for (const item of entities) {
      const name = typeof item.name === "string" ? item.name : "Unknown";
      const description = typeof item.description === "string" ? item.description : "";
      lines.push(`  - ${name}: ${description}`);
    }
  }

  if (entity) {
    if (lines.length > 0) lines.push("");
    lines.push("Entity");
    for (const [key, value] of Object.entries(entity)) {
      if (Array.isArray(value)) {
        lines.push(`  ${toDisplayLabel(key)}: ${value.map((entry) => formatScalar(entry)).join(", ")}`);
      } else {
        lines.push(`  ${toDisplayLabel(key)}: ${formatScalar(value)}`);
      }
    }
  }

  return lines.join("\n");
}

function formatStatementsWriteLocal(payload: PrettyRenderable): string {
  const root = typeof payload.root === "string" ? payload.root : "";
  const statementCount = typeof payload.statementCount === "number" ? payload.statementCount : null;
  const mode = typeof payload.mode === "string" ? payload.mode : "";
  const outPath = typeof payload.outPath === "string" ? payload.outPath : "";
  const warnings = Array.isArray(payload.warnings) ? payload.warnings as string[] : [];

  const lines: string[] = [];
  if (root) lines.push(`root: ${root}`);
  if (statementCount !== null) lines.push(`statements: ${statementCount}`);
  if (mode) lines.push(`mode: ${mode}`);
  if (outPath) lines.push(`output: ${outPath}`);
  if (warnings.length > 0) {
    lines.push(`warnings: ${warnings.join(", ")}`);
  }
  return lines.join("\n");
}

export function formatPretty(scope: string, payload: PrettyRenderable): string | null {
  switch (scope) {
    case "status.v1":
      return formatTopLevelStatus(payload);
    case "graph-status.v1":
      return formatGraphStatus(payload);
    case "workspace-list.v1":
      return formatWorkspaceList(payload);
    case "workspace-get.v1":
      return formatWorkspaceGet(payload);
    case "workspace-members.v1":
      return formatWorkspaceMembers(payload);
    case "statements-guide.v1":
      return formatStatementsGuide(payload);
    case "statements-write-local.v1":
      return formatStatementsWriteLocal(payload);
    default:
      return renderGenericPretty(payload);
  }
}
