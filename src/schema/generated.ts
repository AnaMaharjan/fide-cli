export const GENERATED_TYPE_SCHEMAS = {
  "docs.output": {
    "command": "fide schema --surface docs.output",
    "format": "ts-type.v0",
    "typeName": "DocsOutput",
    "source": "src/commands/docs.ts",
    "schema": {
      "type": "object",
      "required": [
        "ok",
        "scope",
        "command",
        "path",
        "title",
        "description",
        "body",
        "filePath"
      ],
      "properties": {
        "ok": {
          "type": "boolean",
          "enum": [
            true
          ]
        },
        "scope": {
          "type": "string",
          "enum": [
            "docs.v1"
          ]
        },
        "command": {
          "type": "string",
          "enum": [
            "fide docs"
          ]
        },
        "path": {
          "type": "string"
        },
        "title": {
          "anyOf": [
            {
              "type": "string"
            },
            {
              "type": "null"
            }
          ]
        },
        "description": {
          "anyOf": [
            {
              "type": "string"
            },
            {
              "type": "null"
            }
          ]
        },
        "body": {
          "type": "string"
        },
        "filePath": {
          "type": "string"
        }
      }
    }
  },
  "graph.connect.output": {
    "command": "fide schema --surface graph.connect.output",
    "format": "ts-type.v0",
    "typeName": "GraphConnectOutput",
    "source": "src/commands/graph/connect.ts",
    "schema": {
      "type": "object",
      "required": [
        "ok",
        "scope",
        "command"
      ],
      "properties": {
        "ok": {
          "type": "boolean",
          "enum": [
            true
          ]
        },
        "scope": {
          "type": "string",
          "enum": [
            "graph-connect-local.v1"
          ]
        },
        "command": {
          "type": "string",
          "enum": [
            "fide graph connect"
          ]
        },
        "next": {
          "anyOf": [
            {
              "type": "object",
              "properties": {}
            }
          ]
        }
      }
    }
  },
  "graph.get.output": {
    "command": "fide schema --surface graph.get.output",
    "format": "ts-type.v0",
    "typeName": "GraphGetOutput",
    "source": "src/commands/graph/get.ts",
    "schema": {
      "type": "object",
      "required": [
        "targetScope",
        "root",
        "graphKey",
        "graph"
      ],
      "properties": {
        "targetScope": {
          "type": "string",
          "enum": [
            "local"
          ]
        },
        "root": {
          "type": "string"
        },
        "graphKey": {
          "type": "string"
        },
        "graph": {
          "type": "object",
          "properties": {}
        }
      }
    }
  },
  "graph.list.output": {
    "command": "fide schema --surface graph.list.output",
    "format": "ts-type.v0",
    "typeName": "GraphListOutput",
    "source": "src/commands/graph/list.ts",
    "schema": {
      "type": "object",
      "required": [
        "targetScope",
        "root",
        "graphs"
      ],
      "properties": {
        "targetScope": {
          "type": "string",
          "enum": [
            "local"
          ]
        },
        "root": {
          "type": "string"
        },
        "graphs": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {}
          }
        }
      }
    }
  },
  "graph.status.output": {
    "command": "fide schema --surface graph.status.output",
    "format": "ts-type.v0",
    "typeName": "GraphStatusOutput",
    "source": "src/commands/graph/status.ts",
    "schema": {
      "type": "object",
      "required": [
        "ok",
        "scope",
        "local",
        "graphs"
      ],
      "properties": {
        "ok": {
          "type": "boolean",
          "enum": [
            true
          ]
        },
        "scope": {
          "type": "string",
          "enum": [
            "graph-status.v1"
          ]
        },
        "local": {
          "anyOf": [
            {
              "type": "object",
              "properties": {}
            },
            {
              "type": "null"
            }
          ]
        },
        "graphs": {
          "type": "array",
          "items": {
            "type": "unknown"
          }
        }
      }
    }
  },
  "login.output": {
    "command": "fide schema --surface login.output",
    "format": "ts-type.v0",
    "typeName": "AuthLoginOutput",
    "source": "src/commands/auth/login.ts",
    "schema": {
      "type": "object",
      "required": [
        "ok",
        "scope",
        "command",
        "baseUrl",
        "account",
        "source",
        "user",
        "workspace",
        "projectSettingsPath",
        "requestId",
        "loopback"
      ],
      "properties": {
        "ok": {
          "type": "boolean",
          "enum": [
            true
          ]
        },
        "scope": {
          "type": "string",
          "enum": [
            "auth-login.v1"
          ]
        },
        "command": {
          "type": "string",
          "enum": [
            "fide login"
          ]
        },
        "baseUrl": {
          "type": "string"
        },
        "account": {
          "type": "object",
          "properties": {}
        },
        "source": {
          "type": "string"
        },
        "user": {
          "type": "object",
          "properties": {}
        },
        "workspace": {
          "type": "object",
          "properties": {}
        },
        "projectSettingsPath": {
          "type": "string"
        },
        "requestId": {
          "type": "string"
        },
        "loopback": {
          "type": "boolean"
        }
      }
    }
  },
  "logout.output": {
    "command": "fide schema --surface logout.output",
    "format": "ts-type.v0",
    "typeName": "AuthLogoutOutput",
    "source": "src/commands/auth/logout.ts",
    "schema": {
      "type": "object",
      "required": [
        "ok",
        "scope",
        "command",
        "cleared",
        "accountId",
        "userSettingsPath"
      ],
      "properties": {
        "ok": {
          "type": "boolean",
          "enum": [
            true
          ]
        },
        "scope": {
          "type": "string",
          "enum": [
            "auth-logout.v1"
          ]
        },
        "command": {
          "type": "string",
          "enum": [
            "fide logout"
          ]
        },
        "cleared": {
          "type": "boolean"
        },
        "accountId": {
          "type": "string"
        },
        "userSettingsPath": {
          "type": "string"
        }
      }
    }
  },
  "plugin.install.output": {
    "command": "fide schema --surface plugin.install.output",
    "format": "ts-type.v0",
    "typeName": "PluginInstallOutput",
    "source": "src/commands/plugin/install.ts",
    "schema": {
      "type": "object",
      "required": [
        "ok",
        "scope",
        "command"
      ],
      "properties": {
        "ok": {
          "type": "boolean"
        },
        "scope": {
          "type": "string",
          "enum": [
            "plugin-install.v1"
          ]
        },
        "command": {
          "type": "string",
          "enum": [
            "fide plugin install"
          ]
        },
        "error": {
          "anyOf": [
            {
              "type": "string"
            }
          ]
        },
        "source": {
          "anyOf": [
            {
              "type": "string"
            }
          ]
        },
        "pluginId": {
          "anyOf": [
            {
              "type": "string"
            }
          ]
        },
        "version": {
          "anyOf": [
            {
              "type": "string"
            }
          ]
        },
        "installDir": {
          "anyOf": [
            {
              "type": "string"
            }
          ]
        },
        "next": {
          "anyOf": [
            {
              "type": "object",
              "properties": {}
            }
          ]
        }
      }
    }
  },
  "query.get.output": {
    "command": "fide schema --surface query.get.output",
    "format": "ts-type.v0",
    "typeName": "QueryGetOutput",
    "source": "src/commands/query/get.ts",
    "schema": {
      "type": "object",
      "required": [
        "targetScope",
        "root",
        "query"
      ],
      "properties": {
        "targetScope": {
          "type": "string",
          "enum": [
            "local"
          ]
        },
        "root": {
          "type": "string"
        },
        "query": {
          "type": "object",
          "required": [
            "graphKey",
            "name",
            "description",
            "sql"
          ],
          "properties": {
            "graphKey": {
              "type": "string"
            },
            "name": {
              "type": "string"
            },
            "description": {
              "anyOf": [
                {
                  "type": "string"
                },
                {
                  "type": "null"
                }
              ]
            },
            "sql": {
              "type": "string"
            }
          }
        }
      }
    }
  },
  "query.list.output": {
    "command": "fide schema --surface query.list.output",
    "format": "ts-type.v0",
    "typeName": "QueryListOutput",
    "source": "src/commands/query/list.ts",
    "schema": {
      "type": "object",
      "required": [
        "targetScope",
        "root",
        "queries"
      ],
      "properties": {
        "targetScope": {
          "type": "string",
          "enum": [
            "local"
          ]
        },
        "root": {
          "type": "string"
        },
        "queries": {
          "type": "array",
          "items": {
            "type": "object",
            "required": [
              "graphKey",
              "name",
              "description"
            ],
            "properties": {
              "graphKey": {
                "type": "string"
              },
              "name": {
                "type": "string"
              },
              "description": {
                "anyOf": [
                  {
                    "type": "string"
                  },
                  {
                    "type": "null"
                  }
                ]
              }
            }
          }
        }
      }
    }
  },
  "query.load.output": {
    "command": "fide schema --surface query.load.output",
    "format": "ts-type.v0",
    "typeName": "QueryLoadOutput",
    "source": "src/commands/query/load.ts",
    "schema": {
      "type": "object",
      "required": [
        "ok",
        "scope",
        "command",
        "targetScope",
        "destination",
        "graphKey",
        "rowCount",
        "warnings"
      ],
      "properties": {
        "ok": {
          "type": "boolean",
          "enum": [
            true
          ]
        },
        "scope": {
          "type": "string",
          "enum": [
            "graph-query-load-local.v1"
          ]
        },
        "command": {
          "type": "string",
          "enum": [
            "fide query load"
          ]
        },
        "targetScope": {
          "type": "string",
          "enum": [
            "local"
          ]
        },
        "destination": {
          "type": "string"
        },
        "graphKey": {
          "type": "string"
        },
        "rowCount": {
          "type": "number"
        },
        "outPath": {
          "anyOf": [
            {
              "type": "string"
            }
          ]
        },
        "warnings": {
          "type": "array",
          "items": {
            "type": "string"
          }
        }
      }
    }
  },
  "query.save.output": {
    "command": "fide schema --surface query.save.output",
    "format": "ts-type.v0",
    "typeName": "QuerySaveOutput",
    "source": "src/commands/query/save.ts",
    "schema": {
      "type": "object",
      "required": [
        "ok",
        "targetScope",
        "mode",
        "dryRun",
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
        "dryRun": {
          "type": "boolean"
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
  },
  "schema.output": {
    "command": "fide schema --surface schema.output",
    "format": "ts-type.v0",
    "typeName": "SchemaOutput",
    "source": "src/commands/schema/command.ts",
    "schema": {
      "anyOf": [
        {
          "type": "object",
          "required": [
            "ok",
            "scope",
            "command",
            "surfaces",
            "schemas",
            "next"
          ],
          "properties": {
            "ok": {
              "type": "boolean",
              "enum": [
                true
              ]
            },
            "scope": {
              "type": "string",
              "enum": [
                "schema-index.v1"
              ]
            },
            "command": {
              "type": "string",
              "enum": [
                "fide schema"
              ]
            },
            "surfaces": {
              "type": "array",
              "items": {
                "type": "string"
              }
            },
            "schemas": {
              "type": "object",
              "properties": {}
            },
            "next": {
              "type": "string"
            }
          }
        },
        {
          "type": "object",
          "required": [
            "ok",
            "scope",
            "command",
            "surface",
            "schema",
            "next"
          ],
          "properties": {
            "ok": {
              "type": "boolean",
              "enum": [
                true
              ]
            },
            "scope": {
              "type": "string",
              "enum": [
                "schema-surface.v1"
              ]
            },
            "command": {
              "type": "string",
              "enum": [
                "fide schema"
              ]
            },
            "surface": {
              "type": "string"
            },
            "schema": {
              "type": "unknown"
            },
            "next": {
              "type": "string"
            }
          }
        }
      ]
    }
  },
  "start.output": {
    "command": "fide schema --surface start.output",
    "format": "ts-type.v0",
    "typeName": "StartOutput",
    "source": "src/commands/start.ts",
    "schema": {
      "type": "object",
      "required": [
        "ok",
        "scope",
        "command"
      ],
      "properties": {
        "ok": {
          "type": "boolean",
          "enum": [
            true
          ]
        },
        "scope": {
          "type": "string",
          "enum": [
            "start.v1"
          ]
        },
        "command": {
          "type": "string",
          "enum": [
            "fide start"
          ]
        },
        "started": {
          "anyOf": [
            {
              "type": "boolean",
              "enum": [
                false
              ]
            },
            {
              "type": "boolean",
              "enum": [
                true
              ]
            }
          ]
        },
        "alreadyRunning": {
          "anyOf": [
            {
              "type": "boolean",
              "enum": [
                false
              ]
            },
            {
              "type": "boolean",
              "enum": [
                true
              ]
            }
          ]
        },
        "pid": {
          "anyOf": [
            {
              "type": "number"
            }
          ]
        },
        "syncUrl": {
          "anyOf": [
            {
              "type": "string"
            }
          ]
        },
        "workspaceId": {
          "anyOf": [
            {
              "type": "string"
            }
          ]
        }
      }
    }
  },
  "statements.draft.output": {
    "command": "fide schema --surface statements.draft.output",
    "format": "ts-type.v0",
    "typeName": "StatementsDraftOutput",
    "source": "src/commands/statements/draft.ts",
    "schema": {
      "type": "object",
      "required": [
        "name",
        "root",
        "statementCount",
        "mode",
        "outPath",
        "createdAtUTC",
        "updatedAtUTC",
        "updateCount",
        "next",
        "warnings"
      ],
      "properties": {
        "name": {
          "type": "string"
        },
        "root": {
          "type": "string"
        },
        "statementCount": {
          "type": "number"
        },
        "mode": {
          "type": "string",
          "enum": [
            "draft"
          ]
        },
        "outPath": {
          "type": "string"
        },
        "createdAtUTC": {
          "type": "string"
        },
        "updatedAtUTC": {
          "type": "string"
        },
        "updateCount": {
          "type": "number"
        },
        "next": {
          "type": "object",
          "properties": {}
        },
        "warnings": {
          "type": "array",
          "items": {
            "type": "string"
          }
        }
      }
    }
  },
  "statements.guide.output": {
    "command": "fide schema --surface statements.guide.output",
    "format": "ts-type.v0",
    "typeName": "StatementsGuideOutput",
    "source": "src/commands/statements/guide.ts",
    "schema": {
      "type": "object",
      "required": [
        "ok",
        "scope",
        "command",
        "layers",
        "statementRules"
      ],
      "properties": {
        "ok": {
          "type": "boolean",
          "enum": [
            true
          ]
        },
        "scope": {
          "type": "string",
          "enum": [
            "statements-guide.v1"
          ]
        },
        "command": {
          "type": "string",
          "enum": [
            "fide statements guide"
          ]
        },
        "next": {
          "anyOf": [
            {
              "type": "object",
              "properties": {}
            }
          ]
        },
        "layers": {
          "type": "object",
          "properties": {}
        },
        "entities": {
          "anyOf": [
            {
              "type": "array",
              "items": {
                "type": "unknown"
              }
            }
          ]
        },
        "entity": {
          "type": "unknown"
        },
        "statementRules": {
          "type": "array",
          "items": {
            "type": "unknown"
          }
        }
      }
    }
  },
  "statements.load.output": {
    "command": "fide schema --surface statements.load.output",
    "format": "ts-type.v0",
    "typeName": "StatementsLoadOutput",
    "source": "src/commands/statements/load.ts",
    "schema": {
      "type": "object",
      "required": [
        "ok",
        "scope",
        "command",
        "graphKey",
        "graphStoreType",
        "statementsDir",
        "candidateFileCount",
        "loadedFileCount",
        "skippedRootCount",
        "statementCount",
        "rootBatchCount",
        "warnings"
      ],
      "properties": {
        "ok": {
          "type": "boolean",
          "enum": [
            true
          ]
        },
        "scope": {
          "type": "string",
          "enum": [
            "statements-load.v1"
          ]
        },
        "command": {
          "type": "string",
          "enum": [
            "fide statements load"
          ]
        },
        "graphKey": {
          "type": "string"
        },
        "graphStoreType": {
          "anyOf": [
            {
              "type": "string",
              "enum": [
                "postgres"
              ]
            },
            {
              "type": "string",
              "enum": [
                "sqlite"
              ]
            }
          ]
        },
        "statementsDir": {
          "type": "string"
        },
        "candidateFileCount": {
          "type": "number"
        },
        "loadedFileCount": {
          "type": "number"
        },
        "skippedRootCount": {
          "type": "number"
        },
        "statementCount": {
          "type": "number"
        },
        "rootBatchCount": {
          "type": "number"
        },
        "fromDate": {
          "anyOf": [
            {
              "type": "string"
            }
          ]
        },
        "toDate": {
          "anyOf": [
            {
              "type": "string"
            }
          ]
        },
        "warnings": {
          "type": "array",
          "items": {
            "type": "string"
          }
        }
      }
    }
  },
  "statements.write.output": {
    "command": "fide schema --surface statements.write.output",
    "format": "ts-type.v0",
    "typeName": "StatementsWriteOutput",
    "source": "src/commands/statements/write.ts",
    "schema": {
      "type": "object",
      "required": [
        "root",
        "statementCount",
        "mode",
        "outPath",
        "warnings"
      ],
      "properties": {
        "root": {
          "type": "string"
        },
        "statementCount": {
          "type": "number"
        },
        "mode": {
          "type": "string",
          "enum": [
            "local"
          ]
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
  },
  "status.output": {
    "command": "fide schema --surface status.output",
    "format": "ts-type.v0",
    "typeName": "StatusOutput",
    "source": "src/commands/status.ts",
    "schema": {
      "type": "object",
      "required": [
        "ok",
        "scope",
        "command",
        "machine",
        "project",
        "workspace",
        "sync"
      ],
      "properties": {
        "ok": {
          "type": "boolean",
          "enum": [
            true
          ]
        },
        "scope": {
          "type": "string",
          "enum": [
            "status.v1"
          ]
        },
        "command": {
          "type": "string",
          "enum": [
            "fide status"
          ]
        },
        "machine": {
          "type": "object",
          "properties": {}
        },
        "project": {
          "type": "object",
          "properties": {}
        },
        "workspace": {
          "type": "object",
          "properties": {}
        },
        "sync": {
          "anyOf": [
            {
              "type": "object",
              "properties": {}
            },
            {
              "type": "null"
            }
          ]
        }
      }
    }
  },
  "stop.output": {
    "command": "fide schema --surface stop.output",
    "format": "ts-type.v0",
    "typeName": "StopOutput",
    "source": "src/commands/stop.ts",
    "schema": {
      "type": "object",
      "required": [
        "ok",
        "scope",
        "command",
        "stopped"
      ],
      "properties": {
        "ok": {
          "type": "boolean",
          "enum": [
            true
          ]
        },
        "scope": {
          "type": "string",
          "enum": [
            "stop.v1"
          ]
        },
        "command": {
          "type": "string",
          "enum": [
            "fide stop"
          ]
        },
        "stopped": {
          "type": "boolean"
        },
        "pid": {
          "anyOf": [
            {
              "type": "number"
            }
          ]
        },
        "reason": {
          "anyOf": [
            {
              "type": "string"
            }
          ]
        }
      }
    }
  },
  "whoami.output": {
    "command": "fide schema --surface whoami.output",
    "format": "ts-type.v0",
    "typeName": "AuthWhoamiOutput",
    "source": "src/commands/auth/whoami.ts",
    "schema": {
      "type": "object",
      "required": [
        "ok",
        "scope",
        "command",
        "baseUrl",
        "source",
        "user"
      ],
      "properties": {
        "ok": {
          "type": "boolean",
          "enum": [
            true
          ]
        },
        "scope": {
          "type": "string",
          "enum": [
            "auth-whoami.v1"
          ]
        },
        "command": {
          "type": "string",
          "enum": [
            "fide whoami"
          ]
        },
        "baseUrl": {
          "type": "string"
        },
        "source": {
          "type": "string"
        },
        "user": {
          "type": "object",
          "properties": {}
        }
      }
    }
  },
  "workspace.get.output": {
    "command": "fide schema --surface workspace.get.output",
    "format": "ts-type.v0",
    "typeName": "WorkspaceGetOutput",
    "source": "src/commands/workspace/get.ts",
    "schema": {
      "type": "object",
      "required": [
        "ok",
        "scope",
        "baseUrl",
        "source",
        "workspace"
      ],
      "properties": {
        "ok": {
          "type": "boolean",
          "enum": [
            true
          ]
        },
        "scope": {
          "type": "string",
          "enum": [
            "workspace-get.v1"
          ]
        },
        "baseUrl": {
          "type": "string"
        },
        "source": {
          "type": "string"
        },
        "workspace": {
          "type": "object",
          "properties": {}
        }
      }
    }
  },
  "workspace.list.output": {
    "command": "fide schema --surface workspace.list.output",
    "format": "ts-type.v0",
    "typeName": "WorkspaceListOutput",
    "source": "src/commands/workspace/list.ts",
    "schema": {
      "type": "object",
      "required": [
        "ok",
        "scope",
        "baseUrl",
        "source",
        "workspaces"
      ],
      "properties": {
        "ok": {
          "type": "boolean",
          "enum": [
            true
          ]
        },
        "scope": {
          "type": "string",
          "enum": [
            "workspace-list.v1"
          ]
        },
        "command": {
          "anyOf": [
            {
              "type": "string"
            }
          ]
        },
        "next": {
          "anyOf": [
            {
              "type": "object",
              "properties": {}
            }
          ]
        },
        "baseUrl": {
          "type": "string"
        },
        "source": {
          "type": "string"
        },
        "workspaces": {
          "type": "array",
          "items": {
            "type": "unknown"
          }
        }
      }
    }
  }
} as const;
