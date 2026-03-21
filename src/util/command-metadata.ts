import { renderHelp } from "./help.js";

export type CommandParamSpec = {
  name: string;
  type: string;
  required?: boolean;
  description?: string;
  enum?: string[];
  shorthand?: string;
  valueLabel?: string;
};

export type CommandMetadata = {
  surface: string;
  command: string;
  summary: string;
  usage: string[];
  params: CommandParamSpec[];
  output: Record<string, string>;
  notes?: string[];
  examples?: string[];
};

export function defineCommand<T extends CommandMetadata>(command: T): T {
  return command;
}

function formatValueLabel(param: CommandParamSpec): string {
  if (param.valueLabel) return ` ${param.valueLabel}`;
  if (param.type === "boolean") return "";
  if (param.enum?.length) return ` <${param.enum.join("|")}>`;
  return " <value>";
}

function formatFlagLabel(param: CommandParamSpec): string {
  const longFlag = `--${param.name}${formatValueLabel(param)}`;
  return param.shorthand ? `${longFlag}, ${param.shorthand}` : longFlag;
}

function formatFlagLine(param: CommandParamSpec, width: number): string {
  const label = formatFlagLabel(param);
  const padded = label.padEnd(width, " ");
  return `  ${padded} ${param.description ?? ""}`.trimEnd();
}

export function renderCommandHelp(command: CommandMetadata): string {
  const flagParams = command.params.filter((param) => param.name !== "pretty");
  const prettyParam = command.params.find((param) => param.name === "pretty");
  const flags = [...flagParams, ...(prettyParam ? [prettyParam] : [])];
  const width = flags.reduce((max, param) => Math.max(max, formatFlagLabel(param).length), 0);

  return renderHelp({
    sections: [
      {
        title: "Usage",
        items: command.usage.map((line) => `  ${line}`),
      },
      {
        title: "Flags",
        items: flags.map((param) => formatFlagLine(param, width)),
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

export function commandSchema(command: CommandMetadata) {
  return {
    command: command.command,
    params: command.params.map(({ name, type, required, description, enum: values }) => ({
      name,
      type,
      required,
      description,
      ...(values ? { enum: values } : {}),
    })),
    output: command.output,
  };
}
