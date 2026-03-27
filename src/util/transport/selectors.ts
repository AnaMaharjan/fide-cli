import { dirname, resolve } from "node:path";

export type GraphTransportSelector = {
  type: "graph";
  value: string;
};

export type FileTransportSelector = {
  type: "file";
  value: string;
};

export type TransportSelector = GraphTransportSelector | FileTransportSelector;

export function resolveTransportFilePath(fideDir: string, selectorValue: string): string {
  if (selectorValue.startsWith("/")) {
    return selectorValue;
  }
  if (selectorValue === ".fide" || selectorValue.startsWith(".fide/")) {
    return resolve(dirname(fideDir), selectorValue);
  }
  if (selectorValue === "./.fide" || selectorValue.startsWith("./.fide/")) {
    return resolve(dirname(fideDir), selectorValue.slice(2));
  }
  return resolve(fideDir, selectorValue);
}

export function parseTransportSelector(
  raw: string,
  options: {
    flagName?: string;
    allowedTypes?: readonly TransportSelector["type"][];
  } = {},
): TransportSelector {
  const flagName = options.flagName ?? "--selector";
  const value = raw.trim();
  const separatorIndex = value.indexOf(":");
  if (separatorIndex <= 0 || separatorIndex === value.length - 1) {
    throw new Error(`Invalid ${flagName} value. Expected <type:value>.`);
  }

  const type = value.slice(0, separatorIndex).trim();
  const selectorValue = value.slice(separatorIndex + 1).trim();
  if (type !== "graph" && type !== "file") {
    throw new Error(`Unsupported ${flagName} type: ${type}. Supported types: graph, file.`);
  }
  if (selectorValue.length === 0) {
    throw new Error(`Invalid ${flagName} value. Expected <type:value>.`);
  }
  if (options.allowedTypes && !options.allowedTypes.includes(type)) {
    throw new Error(
      `Unsupported ${flagName} type: ${type}. Supported types for this command: ${options.allowedTypes.join(", ")}.`,
    );
  }

  return { type, value: selectorValue } as TransportSelector;
}
