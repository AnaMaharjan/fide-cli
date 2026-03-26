export const GENERATED_TYPE_SCHEMAS = {
  "query.save.output": {
    "command": "fide schema query.save.output",
    "format": "ts-type.v0",
    "typeName": "QuerySaveOutput",
    "source": "src/commands/query/save.ts",
    "schema": {
      "type": "object",
      "required": [
        "ok",
        "targetScope",
        "mode",
        "graphKey",
        "name",
        "outPath",
        "warnings"
      ],
      "properties": {
        "ok": {
          "type": "boolean",
          "enum": [
            true
          ]
        },
        "targetScope": {
          "type": "string",
          "enum": [
            "local"
          ]
        },
        "mode": {
          "type": "string",
          "enum": [
            "query"
          ]
        },
        "graphKey": {
          "type": "string"
        },
        "name": {
          "type": "string"
        },
        "outPath": {
          "type": "string"
        },
        "warnings": {
          "type": "array",
          "items": {
            "type": "string"
          }
        }
      }
    }
  }
} as const;
