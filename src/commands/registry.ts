import { commandSchemas, type CommandDefinition } from "../util/command/command-metadata.js";
import { authLoginCommand } from "./auth/login.js";
import { authLogoutCommand } from "./auth/logout.js";
import { authWhoamiCommand } from "./auth/whoami.js";
import { docsCommand } from "./docs.js";
import { daemonStartCommand, daemonStopCommand } from "./daemon.js";
import { batchesLoadCommand } from "./batches/load.js";
import { batchesWriteCommand } from "./batches/write.js";
import { pluginInstallCommand } from "./plugin/install.js";
import { graphConnectCommand } from "./graph/connect.js";
import { graphGetCommand } from "./graph/get.js";
import { graphListCommand } from "./graph/list.js";
import { graphStatusCommand } from "./graph/status.js";
import { transformersAddCommand } from "./transformers/add.js";
import { transformersGuideCommand } from "./transformers/guide.js";
import { transformersGetCommand } from "./transformers/get.js";
import { transformersListCommand } from "./transformers/list.js";
import { transformersRemoveCommand } from "./transformers/remove.js";
import { transformersValidateCommand } from "./transformers/validate.js";
import { queryGetCommand } from "./query/get.js";
import { queryListCommand } from "./query/list.js";
import { queryRunCommand } from "./query/run.js";
import { querySaveCommand } from "./query/save.js";
import { schemaCommand } from "./schema/command.js";
import { startCommand } from "./start.js";
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
  daemonStartCommand,
  daemonStopCommand,
  pluginInstallCommand,
  workspaceListCommand,
  workspaceGetCommand,
  queryRunCommand,
  queryListCommand,
  queryGetCommand,
  querySaveCommand,
  batchesLoadCommand,
  batchesWriteCommand,
  transformersAddCommand,
  transformersGuideCommand,
  transformersListCommand,
  transformersGetCommand,
  transformersValidateCommand,
  transformersRemoveCommand,
  graphStatusCommand,
  graphListCommand,
  graphGetCommand,
  graphConnectCommand,
  schemaCommand,
] as const;

export const REGISTRY_COMMAND_SCHEMAS = commandSchemas(ALL_COMMAND_DEFINITIONS);

export { schemaCommand } from "./schema/command.js";
