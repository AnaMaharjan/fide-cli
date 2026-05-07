import { readdir, readFile, stat } from "node:fs/promises";
import { basename, relative, resolve, sep } from "node:path";
import { loadTransformerDoc, transformerDataToStatements } from "@chris-test/graph";
import { parseArgs, shouldUseJsonOutput } from "../../util/command/args.js";
import {
  booleanKeysFromCommand,
  defineCommand,
  mergeBooleanKeySets,
  renderCommandHelp,
} from "../../util/command/command-metadata.js";
import { printJson, writeUtf8 } from "../../util/command/io.js";
import { formatPretty } from "../../util/command/pretty.js";

type JsonObject = Record<string, unknown>;

type BatchWriteEntry = {
  inputPath: string;
  outputPath: string;
  statementCount: number;
  title: string;
};

export type BatchesWriteOutput = {
  command: "fide batches write";
  transformerPath: string;
  dataPath: string;
  outDir: string | null;
  written: BatchWriteEntry[];
};

export const batchesWriteCommand = defineCommand({
  surface: "batches.write",
  command: "fide batches write",
  outputType: "BatchesWriteOutput",
  summary: "Transform source JSON data into statement batch JSON files",
  usage: [
    "fide batches write --transformer <transformer.json> --data <file-or-dir>",
    "fide batches write --transformer <transformer.json> --data <dir> --out <out-dir> [--pretty|-p]",
  ],
  paramOrder: ["transformer", "data", "out", "pretty"],
  params: {
    transformer: { kind: "string", required: true, valueLabel: "<transformer.json>", description: "Statement transformer JSON path" },
    data: {
      kind: "string",
      required: true,
      valueLabel: "<file-or-dir>",
      description: "Input data .source.json file or folder of source files",
    },
    out: {
      kind: "string",
      valueLabel: "<out-dir>",
      description: "Optional output directory override",
    },
    pretty: { kind: "boolean", shorthand: "-p", description: "Human-readable output" },
  },
  notes: [
    "When --data is a directory, this command recursively transforms all *.source.json files in that directory.",
    "Default output path mirrors .fide/data/... into .fide/batches/... and writes .batch.json files.",
    "When --out is provided, output files are written under that directory with the same relative input names.",
  ],
});

const BATCHES_WRITE_PARSE_KEYS = mergeBooleanKeySets(booleanKeysFromCommand(batchesWriteCommand));

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function replaceFileSuffix(inputPath: string): string {
  if (inputPath.endsWith(".source.json")) {
    return `${inputPath.slice(0, -".source.json".length)}.batch.json`;
  }
  if (inputPath.endsWith(".json")) {
    return `${inputPath.slice(0, -".json".length)}.batch.json`;
  }
  return `${inputPath}.batch.json`;
}

async function listSourceFiles(rootDir: string): Promise<string[]> {
  const entries = await readdir(rootDir, { withFileTypes: true });
  const out: string[] = [];
  for (const entry of entries) {
    const fullPath = resolve(rootDir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await listSourceFiles(fullPath)));
      continue;
    }
    if (entry.isFile() && fullPath.endsWith(".source.json")) {
      out.push(fullPath);
    }
  }
  return out.sort((a, b) => a.localeCompare(b));
}

function defaultOutputPathFromInput(inputFile: string): string {
  const dataSegment = `${sep}.fide${sep}data${sep}`;
  const batchesSegment = `${sep}.fide${sep}batches${sep}`;
  const markerIndex = inputFile.indexOf(dataSegment);
  const candidate = markerIndex >= 0
    ? `${inputFile.slice(0, markerIndex)}${batchesSegment}${inputFile.slice(markerIndex + dataSegment.length)}`
    : inputFile;
  return replaceFileSuffix(candidate);
}

function outputPathForInput(params: {
  inputFile: string;
  dataPath: string;
  dataIsDirectory: boolean;
  outDir: string | null;
}): string {
  const { inputFile, dataPath, dataIsDirectory, outDir } = params;
  if (!outDir) {
    return defaultOutputPathFromInput(inputFile);
  }

  const relativeInput = dataIsDirectory
    ? relative(dataPath, inputFile)
    : basename(inputFile);
  return replaceFileSuffix(resolve(outDir, relativeInput));
}

async function readJsonObject(path: string): Promise<JsonObject> {
  const parsed = JSON.parse(await readFile(path, "utf8")) as unknown;
  if (!isObject(parsed)) {
    throw new Error(`Expected JSON object in ${path}`);
  }
  return parsed;
}

export async function runBatchesWrite(args: string[]): Promise<number> {
  const parsed = parseArgs(args, { booleanKeys: BATCHES_WRITE_PARSE_KEYS });
  if (parsed.flags.has("help")) {
    console.log(renderCommandHelp(batchesWriteCommand));
    return 0;
  }
  if (parsed.positionals.length > 0) {
    throw new Error(`Unexpected arguments: ${parsed.positionals.join(" ")}`);
  }

  const transformerFlag = parsed.flags.get("transformer");
  if (typeof transformerFlag !== "string" || transformerFlag.length === 0) {
    throw new Error("Missing required flag: --transformer <transformer.json>.");
  }
  const dataFlag = parsed.flags.get("data");
  if (typeof dataFlag !== "string" || dataFlag.length === 0) {
    throw new Error("Missing required flag: --data <file-or-dir>.");
  }
  const outFlag = parsed.flags.get("out");
  if (outFlag !== undefined && typeof outFlag !== "string") {
    throw new Error("Invalid --out: expected <out-dir>.");
  }

  const transformerPath = resolve(process.cwd(), transformerFlag);
  const dataPath = resolve(process.cwd(), dataFlag);
  const outDir = typeof outFlag === "string" ? resolve(process.cwd(), outFlag) : null;

  const transformerDoc = await loadTransformerDoc(transformerPath);
  const dataStat = await stat(dataPath);
  const inputFiles = dataStat.isDirectory() ? await listSourceFiles(dataPath) : [dataPath];
  if (inputFiles.length === 0) {
    throw new Error(`No *.source.json files found under ${dataPath}.`);
  }

  const written: BatchWriteEntry[] = [];
  for (const inputFile of inputFiles) {
    const data = await readJsonObject(inputFile);
    const batch = transformerDataToStatements(data, transformerDoc);
    const outputPath = outputPathForInput({
      inputFile,
      dataPath,
      dataIsDirectory: dataStat.isDirectory(),
      outDir,
    });
    await writeUtf8(outputPath, `${JSON.stringify(batch, null, 2)}\n`);
    written.push({
      inputPath: inputFile,
      outputPath,
      statementCount: batch.statements.length,
      title: batch.title,
    });
  }

  const payload: BatchesWriteOutput = {
    command: "fide batches write",
    transformerPath,
    dataPath,
    outDir: outDir ?? null,
    written,
  };
  if (shouldUseJsonOutput(parsed.flags)) {
    printJson(payload);
  } else {
    console.log(formatPretty("batches-write.v1", payload));
  }
  return 0;
}
