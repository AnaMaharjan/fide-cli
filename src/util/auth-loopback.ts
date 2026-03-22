import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

type LoopbackResult = {
  requestId: string | null;
  exchangeCode: string | null;
};

function html(body: string) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Fide CLI</title></head><body style="font-family:system-ui;padding:24px;">${body}</body></html>`;
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
      res.end(html("<h1>Fide CLI</h1><p>Missing request or exchange code. Return to the CLI and use the fallback code from the browser.</p>"));
      return;
    }

    res.end(html("<h1>Fide CLI</h1><p>Authorization received. You can close this tab and return to the CLI.</p>"));
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
