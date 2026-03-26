import fs from "node:fs/promises";
import path from "node:path";
import ts from "typescript";

const CLI_ROOT = path.resolve(import.meta.dirname, "..", "..");
const SRC_ROOT = path.join(CLI_ROOT, "src");
const OUT_PATH = path.join(SRC_ROOT, "schema", "generated.ts");
const COMMANDS_ROOT = path.join(SRC_ROOT, "commands");

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

function readStringLiteralProperty(objectLiteral, name) {
  for (const property of objectLiteral.properties) {
    if (!ts.isPropertyAssignment(property) || !ts.isIdentifier(property.name) || property.name.text !== name) {
      continue;
    }
    if (ts.isStringLiteral(property.initializer) || ts.isNoSubstitutionTemplateLiteral(property.initializer)) {
      return property.initializer.text;
    }
  }
  return null;
}

function findCommandOutputEntries(sourceFile, relativeSourcePath) {
  const entries = [];
  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    const exported = statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword);
    if (!exported) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (!declaration.initializer || !ts.isCallExpression(declaration.initializer)) continue;
      const call = declaration.initializer;
      if (!ts.isIdentifier(call.expression) || call.expression.text !== "defineCommand") continue;
      const [arg] = call.arguments;
      if (!arg || !ts.isObjectLiteralExpression(arg)) continue;
      const surface = readStringLiteralProperty(arg, "surface");
      const outputType = readStringLiteralProperty(arg, "outputType");
      if (!surface || !outputType) continue;
      entries.push({
        surface: `${surface}.output`,
        command: `fide schema --surface ${surface}.output`,
        source: relativeSourcePath,
        typeName: outputType,
        format: "ts-type.v0",
      });
    }
  }
  return entries;
}

function findOutputTypeEntries() {
  const sourcePaths = ts.sys.readDirectory(COMMANDS_ROOT, [".ts"], undefined, undefined)
    .filter((filePath) => !filePath.endsWith(".d.ts"));
  const entries = [];
  for (const sourcePath of sourcePaths) {
    const text = ts.sys.readFile(sourcePath);
    if (!text) continue;
    const sourceFile = ts.createSourceFile(sourcePath, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const relativeSourcePath = path.relative(CLI_ROOT, sourcePath).replaceAll(path.sep, "/");
    entries.push(...findCommandOutputEntries(sourceFile, relativeSourcePath));
  }
  return entries.sort((a, b) => a.surface.localeCompare(b.surface));
}

async function generate() {
  const options = loadCompilerOptions();
  const outputTypeEntries = findOutputTypeEntries();
  const sourcePaths = [...new Set(outputTypeEntries.map((entry) => path.join(CLI_ROOT, entry.source)))];
  const program = ts.createProgram(sourcePaths, options);
  const checker = program.getTypeChecker();
  const generatedSchemas = {};

  for (const entry of outputTypeEntries) {
    const sourcePath = path.join(CLI_ROOT, entry.source);
    const sourceFile = program.getSourceFile(sourcePath);
    if (!sourceFile) throw new Error(`Missing source file: ${sourcePath}`);

    const alias = findExportedTypeAlias(sourceFile, entry.typeName);
    if (!alias) throw new Error(`Could not find exported type alias ${entry.typeName}.`);
    const type = checker.getTypeAtLocation(alias);
    generatedSchemas[entry.surface] = {
      command: entry.command,
      format: entry.format,
      typeName: entry.typeName,
      source: entry.source,
      schema: serializeType(type, checker, alias),
    };
  }

  const generated = `export const GENERATED_TYPE_SCHEMAS = ${JSON.stringify(generatedSchemas, null, 2)} as const;\n`;

  await fs.mkdir(path.dirname(OUT_PATH), { recursive: true });
  await fs.writeFile(OUT_PATH, generated, "utf8");
}

generate().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
