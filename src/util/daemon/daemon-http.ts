const DEFAULT_DAEMON_HOST = "127.0.0.1";
const DEFAULT_DAEMON_PORT = 20225;

function parseDaemonPort(raw: string | undefined): number {
  if (!raw) {
    return DEFAULT_DAEMON_PORT;
  }
  const value = Number.parseInt(raw, 10);
  if (!Number.isInteger(value) || value < 0 || value > 65535) {
    return DEFAULT_DAEMON_PORT;
  }
  return value;
}

export function resolveDaemonOrigin(): string {
  const base = process.env.FIDE_DAEMON_URL?.trim();
  if (base) {
    return base.replace(/\/$/u, "");
  }
  const host = process.env.FIDE_DAEMON_HOST?.trim() || DEFAULT_DAEMON_HOST;
  const port = parseDaemonPort(process.env.FIDE_DAEMON_PORT);
  return `http://${host}:${port}`;
}

export function daemonJsonHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/json",
  };
  const token = process.env.FIDE_LOCAL_CONTROL_TOKEN?.trim();
  if (token) {
    headers.authorization = `Bearer ${token}`;
  }
  return headers;
}

export async function postDaemonMapsInstall(
  files: { relativePath: string; content: string }[],
): Promise<void> {
  const res = await fetch(`${resolveDaemonOrigin()}/maps/install`, {
    method: "POST",
    headers: daemonJsonHeaders(),
    body: JSON.stringify({ files }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Daemon maps/install failed (${res.status}): ${text || res.statusText}`);
  }
}

export async function postDaemonMapsRemove(mapKey: string): Promise<void> {
  const res = await fetch(`${resolveDaemonOrigin()}/maps/remove`, {
    method: "POST",
    headers: daemonJsonHeaders(),
    body: JSON.stringify({ mapKey }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Daemon maps/remove failed (${res.status}): ${text || res.statusText}`);
  }
}

export type DaemonGraphRow = {
  graphKey: string;
  type: 'sqlite' | 'duckdb' | 'postgres' | 'fide-jsonl' | null;
  fidePath: string | null;
  projectPath: string | null;
  url: string | null;
  updatedAt: string | null;
}

export async function getDaemonGraphs(): Promise<DaemonGraphRow[]> {
  const res = await fetch(`${resolveDaemonOrigin()}/graphs`, {
    method: 'GET',
    headers: daemonJsonHeaders(),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Daemon graphs failed (${res.status}): ${text || res.statusText}`)
  }
  const json = (await res.json()) as { graphs?: DaemonGraphRow[] }
  return json.graphs ?? []
}
