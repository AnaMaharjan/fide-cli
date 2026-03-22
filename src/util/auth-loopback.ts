import { readFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

type LoopbackResult = {
  requestId: string | null;
  exchangeCode: string | null;
};

let cachedBrandIconSvg: string | null = null;

function getBrandIconSvg() {
  if (cachedBrandIconSvg !== null) {
    return cachedBrandIconSvg;
  }

  try {
    cachedBrandIconSvg = readFileSync(
      new URL("../../src/lib/icon.svg", import.meta.url),
      "utf8",
    ).replace(
      /<svg\b/,
      '<svg aria-hidden="true"',
    );
  } catch {
    cachedBrandIconSvg = "";
  }

  return cachedBrandIconSvg;
}

function html(body: string) {
  const brandIcon = getBrandIconSvg();

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Fide CLI</title>
    <style>
      :root {
        --bg: oklch(1 0 0);
        --fg: oklch(0.145 0 0);
        --muted: oklch(0.556 0 0);
        --border: oklch(0.922 0 0);
        --card: oklch(1 0 0);
        color-scheme: light dark;
      }

      @media (prefers-color-scheme: dark) {
        :root {
          --bg: oklch(0.145 0 0);
          --fg: oklch(0.985 0 0);
          --muted: oklch(0.708 0 0);
          --border: oklch(1 0 0 / 10%);
          --card: oklch(0.205 0 0);
        }
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        padding: 24px;
        background: var(--bg);
        color: var(--fg);
        font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      main {
        width: min(440px, 100%);
        padding: 28px 24px;
        border: 1px solid var(--border);
        border-radius: 18px;
        background: var(--card);
        text-align: center;
      }

      .brand {
        display: inline-flex;
        align-items: center;
        gap: 12px;
        margin-bottom: 20px;
        color: inherit;
        text-decoration: none;
      }

      .brand-mark {
        width: 32px;
        height: 32px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex: 0 0 auto;
      }

      .brand-mark svg {
        width: 100%;
        height: 100%;
        display: block;
      }

      .brand-name {
        font-size: 2rem;
        font-weight: 700;
        letter-spacing: 0.14em;
        line-height: 1;
      }

      h1 {
        margin: 0 0 10px;
        font-size: 1.1rem;
        font-weight: 600;
        letter-spacing: -0.02em;
      }

      p {
        margin: 0;
        color: var(--muted);
        font-size: 1.02rem;
        line-height: 1.5;
      }
    </style>
  </head>
  <body>
    <main>
      <a class="brand" href="https://fide.work" target="_blank" rel="noreferrer">
        <span class="brand-mark">${brandIcon}</span>
        <span class="brand-name">FIDE</span>
      </a>
      ${body}
    </main>
  </body>
</html>`;
}

export async function startAgentAuthLoopbackServer(): Promise<{
  callbackUrl: string;
  waitForCallback: (timeoutMs: number) => Promise<LoopbackResult | null>;
  close: () => Promise<void>;
}> {
  let resolveCallback: ((value: LoopbackResult | null) => void) | null = null;
  let settled = false;

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const requestId = url.searchParams.get("request");
    const exchangeCode = url.searchParams.get("exchangeCode");

    res.statusCode = 200;
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.setHeader("connection", "close");

    if (!requestId || !exchangeCode) {
      res.end(html("<h1>Authorization Incomplete</h1><p>Return to the CLI and use the fallback code from the browser.</p>"));
      return;
    }

    res.end(html("<h1>Agent Authorized</h1><p>You can close this tab and return to the CLI.</p>"));
    if (!settled && resolveCallback) {
      settled = true;
      resolveCallback({ requestId, exchangeCode });
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to start local callback server.");
  }

  return {
    callbackUrl: `http://127.0.0.1:${address.port}/callback`,
    waitForCallback(timeoutMs: number) {
      return new Promise<LoopbackResult | null>((resolve) => {
        resolveCallback = resolve;
        const timer = setTimeout(() => {
          if (!settled) {
            settled = true;
            resolve(null);
          }
        }, timeoutMs);

        const wrappedResolve = resolveCallback;
        resolveCallback = (value) => {
          clearTimeout(timer);
          wrappedResolve?.(value);
        };
      });
    },
    async close() {
      server.closeIdleConnections?.();
      server.closeAllConnections?.();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    },
  };
}
