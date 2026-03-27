import { commandSchemas, type CommandDefinition } from "../util/command/command-metadata.js";
import { authLoginCommand } from "./auth/login.js";
import { authLogoutCommand } from "./auth/logout.js";
import { authWhoamiCommand } from "./auth/whoami.js";
import { docsCommand } from "./docs.js";
import { pluginInstallCommand } from "./plugin/install.js";
import { graphConnectCommand } from "./graph/connect.js";
import { graphGetCommand } from "./graph/get.js";
import { graphListCommand } from "./graph/list.js";
import { graphStatusCommand } from "./graph/status.js";
import { queryGetCommand } from "./query/get.js";
import { queryListCommand } from "./query/list.js";
import { queryLoadCommand } from "./query/load.js";
import { querySaveCommand } from "./query/save.js";
import { schemaCommand } from "./schema/command.js";
import { startCommand } from "./start.js";
import { statementsDraftCommand } from "./statements/draft.js";
import { statementsGuideCommand } from "./statements/guide.js";
import { statementsLoadCommand } from "./statements/load.js";
import { statementsWriteCommand } from "./statements/write.js";
import { statusCommand } from "./status.js";
import { stopCommand } from "./stop.js";
import { workspaceGetCommand } from "./workspace/get.js";
import { workspaceListCommand } from "./workspace/list.js";

/**
 * All command definitions for schema aggregation and docs. Order is stable for human review; `fide schema` index sorts keys.
 */
export const ALL_COMMAND_DEFINITIONS: readonly CommandDefinition[] = [
  statusCommand,
  startCommand,
  stopCommand,
  authLoginCommand,
  authLogoutCommand,
  authWhoamiCommand,
  docsCommand,
  pluginInstallCommand,
  workspaceListCommand,
  workspaceGetCommand,
  queryLoadCommand,
  queryListCommand,
  queryGetCommand,
  querySaveCommand,
  statementsWriteCommand,
  statementsDraftCommand,
  statementsLoadCommand,
  statementsGuideCommand,
  graphStatusCommand,
  graphListCommand,
  graphGetCommand,
  graphConnectCommand,
  schemaCommand,
] as const;

export const REGISTRY_COMMAND_SCHEMAS = commandSchemas(ALL_COMMAND_DEFINITIONS);

export { schemaCommand } from "./schema/command.js";
