import fs from "node:fs/promises";
import path from "node:path";
import ts from "typescript";

const CLI_ROOT = path.resolve(import.meta.dirname, "..", "..");
const SRC_ROOT = path.join(CLI_ROOT, "src");
const OUT_PATH = path.join(SRC_ROOT, "schema", "generated.ts");

function loadCompilerOptions() {
  const configPath = ts.findConfigFile(CLI_ROOT, ts.sys.fileExists, "tsconfig.json");
  if (!configPath) throw new Error("Could not find tsconfig.json for CLI package.");
  const read = ts.readConfigFile(configPath, ts.sys.readFile);
  if (read.error) throw new Error(ts.flattenDiagnosticMessageText(read.error.messageText, "\n"));
  const parsed = ts.parseJsonConfigFileContent(read.config, ts.sys, path.dirname(configPath));
  return parsed.options;
}

function isUndefinedType(type) {
  return (type.flags & ts.TypeFlags.Undefined) !== 0;
}

function isNullType(type) {
  return (type.flags & ts.TypeFlags.Null) !== 0;
}

function serializeType(type, checker, node) {
  if (type.isStringLiteral()) {
    return { type: "string", enum: [type.value] };
  }
  if (type.isNumberLiteral()) {
    return { type: "number", enum: [type.value] };
  }
  if ((type.flags & ts.TypeFlags.StringLike) !== 0) {
    return { type: "string" };
  }
  if ((type.flags & ts.TypeFlags.NumberLike) !== 0) {
    return { type: "number" };
  }
  if ((type.flags & ts.TypeFlags.BooleanLike) !== 0) {
    if ((type.flags & ts.TypeFlags.BooleanLiteral) !== 0) {
      return { type: "boolean", enum: [type.intrinsicName === "true"] };
    }
    return { type: "boolean" };
  }
  if (type.isUnion()) {
    const nonUndefined = type.types.filter((entry) => !isUndefinedType(entry));
    const hasNull = nonUndefined.some(isNullType);
    const withoutNull = nonUndefined.filter((entry) => !isNullType(entry));
    if (withoutNull.length === 1 && hasNull) {
      return {
        anyOf: [
          serializeType(withoutNull[0], checker, node),
          { type: "null" },
        ],
      };
    }
    return {
      anyOf: nonUndefined.map((entry) => serializeType(entry, checker, node)),
    };
  }
  if (checker.isArrayType(type)) {
    const [itemType] = checker.getTypeArguments(type);
    return {
      type: "array",
      items: itemType ? serializeType(itemType, checker, node) : { type: "unknown" },
    };
  }
  if ((type.flags & ts.TypeFlags.Object) !== 0) {
    const properties = {};
    const required = [];
    for (const prop of checker.getPropertiesOfType(type)) {
      const propType = checker.getTypeOfSymbolAtLocation(prop, node);
      const optional = (prop.flags & ts.SymbolFlags.Optional) !== 0 || (propType.isUnion() && propType.types.some(isUndefinedType));
      properties[prop.getName()] = serializeType(propType, checker, node);
      if (!optional) required.push(prop.getName());
    }
    return {
      type: "object",
      ...(required.length > 0 ? { required } : {}),
      properties,
    };
  }
  return { type: checker.typeToString(type) };
}

function findExportedTypeAlias(sourceFile, typeName) {
  for (const statement of sourceFile.statements) {
    if (ts.isTypeAliasDeclaration(statement) && statement.name.text === typeName) {
      const exported = statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword);
      if (exported) return statement;
    }
  }
  return null;
}

async function generate() {
  const options = loadCompilerOptions();
  const savePath = path.join(SRC_ROOT, "commands", "query", "save.ts");
  const program = ts.createProgram([savePath], options);
  const checker = program.getTypeChecker();
  const sourceFile = program.getSourceFile(savePath);
  if (!sourceFile) throw new Error(`Missing source file: ${savePath}`);

  const alias = findExportedTypeAlias(sourceFile, "QuerySaveOutput");
  if (!alias) throw new Error("Could not find exported type alias QuerySaveOutput.");
  const type = checker.getTypeAtLocation(alias);
  const schema = serializeType(type, checker, alias);

  const generated = `export const GENERATED_TYPE_SCHEMAS = ${JSON.stringify({
    "query.save.output": {
      command: "fide schema query.save.output",
      format: "ts-type.v0",
      typeName: "QuerySaveOutput",
      source: "src/commands/query/save.ts",
      schema,
    },
  }, null, 2)} as const;\n`;

  await fs.mkdir(path.dirname(OUT_PATH), { recursive: true });
  await fs.writeFile(OUT_PATH, generated, "utf8");
}

generate().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
