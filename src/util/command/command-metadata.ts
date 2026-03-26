import { renderHelp } from "./help.js";
import { getStringFlag, hasFlag, type ParsedArgs } from "./args.js";

/** Flags that are always parsed as boolean when bare (no value). `--help` is not on every CommandDefinition but must parse correctly. */
export const PARSE_TIME_GLOBAL_BOOLEAN_FLAGS = new Set<string>(["help"]);

export type StringParamSpec = {
  kind: "string";
  required?: boolean;
  description?: string;
  shorthand?: string;
  valueLabel?: string;
  enum?: readonly string[];
};

export type BooleanParamSpec = {
  kind: "boolean";
  required?: boolean;
  description?: string;
  shorthand?: string;
};

export type NumberParamSpec = {
  kind: "number";
  required?: boolean;
  description?: string;
  shorthand?: string;
  valueLabel?: string;
};

export type ParamSpec = StringParamSpec | BooleanParamSpec | NumberParamSpec;

export type CommandDefinition = {
  surface: string;
  command: string;
  summary: string;
  usage: string[];
  /** Exported TypeScript type alias name used to generate `<surface>.output`, when present. */
  outputType?: string;
  params: Record<string, ParamSpec>;
  /** Display / help order; defaults to sorted param keys. */
  paramOrder?: string[];
  notes?: string[];
  examples?: string[];
};

export function defineCommand<T extends CommandDefinition>(command: T): T {
  return command;
}

export function booleanKeysFromCommand(command: CommandDefinition): Set<string> {
  const keys = new Set<string>();
  for (const [name, spec] of Object.entries(command.params)) {
    if (spec.kind === "boolean") keys.add(name);
  }
  return keys;
}

export function mergeBooleanKeySets(...sets: ReadonlySet<string>[]): Set<string> {
  const out = new Set<string>(PARSE_TIME_GLOBAL_BOOLEAN_FLAGS);
  for (const set of sets) {
    for (const k of set) out.add(k);
  }
  return out;
}

function orderedParamKeys(command: CommandDefinition): string[] {
  if (command.paramOrder?.length) {
    return command.paramOrder.filter((k) => k in command.params);
  }
  return Object.keys(command.params).sort();
}

function formatValueLabel(name: string, spec: ParamSpec): string {
  if (spec.kind === "boolean") return "";
  if ("valueLabel" in spec && spec.valueLabel) return ` ${spec.valueLabel}`;
  if (spec.kind === "string" && spec.enum?.length) return ` <${spec.enum.join("|")}>`;
  return " <value>";
}

function formatFlagLabel(name: string, spec: ParamSpec): string {
  const longFlag = `--${name}${formatValueLabel(name, spec)}`;
  return spec.shorthand ? `${longFlag}, ${spec.shorthand}` : longFlag;
}

function formatFlagLine(name: string, spec: ParamSpec, width: number): string {
  const label = formatFlagLabel(name, spec);
  const padded = label.padEnd(width, " ");
  return `  ${padded} ${spec.description ?? ""}`.trimEnd();
}

export function renderCommandHelp(command: CommandDefinition): string {
  const keys = orderedParamKeys(command).filter((k) => k !== "pretty");
  const prettyKey = command.params.pretty ? "pretty" : null;
  const flagKeys = prettyKey ? [...keys, prettyKey] : keys;
  const width = flagKeys.reduce((max, key) => {
    const spec = command.params[key];
    return spec ? Math.max(max, formatFlagLabel(key, spec).length) : max;
  }, 0);

  return renderHelp({
    sections: [
      {
        title: "Usage",
        items: command.usage.map((line) => `  ${line}`),
      },
      {
        title: "Flags",
        items: flagKeys
          .map((key) => {
            const spec = command.params[key];
            return spec ? formatFlagLine(key, spec, width) : "";
          })
          .filter(Boolean),
      },
      {
        title: "Examples",
        items: (command.examples ?? []).map((line) => `  ${line}`),
      },
      {
        title: "Notes",
        items: (command.notes ?? []).map((line) => `  - ${line}`),
      },
    ],
  });
}

/** Machine-readable schema for `fide schema --surface <surface>` (params only; output types are generated). */
export function commandSchema(command: CommandDefinition) {
  const params = orderedParamKeys(command).map((name) => {
    const spec = command.params[name];
    if (!spec) return null;
    if (spec.kind === "string") {
      return {
        name,
        type: "string" as const,
        required: spec.required,
        description: spec.description,
        ...(spec.enum?.length ? { enum: [...spec.enum] } : {}),
      };
    }
    if (spec.kind === "boolean") {
      return { name, type: "boolean" as const, required: spec.required, description: spec.description };
    }
    return { name, type: "number" as const, required: spec.required, description: spec.description };
  }).filter((p): p is NonNullable<typeof p> => p !== null);

  return {
    command: command.command,
    params,
    output: {} as Record<string, string>,
  };
}

export function commandSchemas(commands: readonly CommandDefinition[]) {
  return Object.fromEntries(commands.map((cmd) => [cmd.surface, commandSchema(cmd)]));
}

function getCommandParam(command: CommandDefinition, name: string): ParamSpec {
  const spec = command.params[name];
  if (!spec) {
    throw new Error(`Command definition for ${command.command} is missing param: ${name}`);
  }
  return spec;
}

export function readCommandStringFlag(
  command: CommandDefinition,
  parsed: ParsedArgs,
  name: string,
): string | null {
  const spec = getCommandParam(command, name);
  if (spec.kind !== "string") {
    throw new Error(`Param ${name} on ${command.command} is not a string flag.`);
  }

  const value = getStringFlag(parsed.flags, name);
  if (value === null) {
    if (spec.required) {
      throw new Error(`Missing required flag: --${name}${formatValueLabel(name, spec)}.`);
    }
    return null;
  }

  if (spec.enum?.length && !spec.enum.includes(value)) {
    throw new Error(`Invalid value for --${name}. Expected one of: ${spec.enum.join(", ")}.`);
  }

  return value;
}

export function readCommandBooleanFlag(
  command: CommandDefinition,
  parsed: ParsedArgs,
  name: string,
): boolean {
  const spec = getCommandParam(command, name);
  if (spec.kind !== "boolean") {
    throw new Error(`Param ${name} on ${command.command} is not boolean.`);
  }
  return hasFlag(parsed.flags, name);
}

export function readCommandNumberFlag(
  command: CommandDefinition,
  parsed: ParsedArgs,
  name: string,
): number | undefined {
  const spec = getCommandParam(command, name);
  if (spec.kind !== "number") {
    throw new Error(`Param ${name} on ${command.command} is not a number flag.`);
  }
  const raw = parsed.flags.get(name);
  if (raw === undefined || raw === false) {
    if (spec.required) {
      throw new Error(`Missing required flag: --${name}${formatValueLabel(name, spec)}.`);
    }
    return undefined;
  }
  if (typeof raw === "boolean") {
    throw new Error(`Invalid --${name}: expected a number.`);
  }
  const n = Number(raw);
  if (!Number.isFinite(n)) {
    throw new Error(`Invalid --${name}: expected a finite number.`);
  }
  return n;
}
