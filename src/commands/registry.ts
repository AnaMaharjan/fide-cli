import { commandSchemas, type CommandDefinition } from "../util/command/command-metadata.js";
import { authLoginCommand } from "./auth/login.js";
import { authLogoutCommand } from "./auth/logout.js";
import { authWhoamiCommand } from "./auth/whoami.js";
import { docsCommand } from "./docs.js";
import { graphBuildCommand } from "./graph/build.js";
import { graphDefsCommand } from "./graph/defs.js";
import { graphGetCommand } from "./graph/get.js";
import { graphGroupCommand } from "./graph/group.js";
import { graphListCommand } from "./graph/list.js";
import { graphSaveCommand } from "./graph/save.js";
import { graphStatusCommand } from "./graph/status.js";
import { queryGetCommand } from "./query/get.js";
import { queryGroupCommand } from "./query/group.js";
import { queryListCommand } from "./query/list.js";
import { queryRunCommand } from "./query/run.js";
import { querySaveCommand } from "./query/save.js";
import { schemaCommand } from "./schema/command.js";
import { startCommand } from "./start.js";
import { statementsDraftCommand } from "./statements/draft.js";
import { statementsGroupCommand } from "./statements/group.js";
import { statementsWriteCommand } from "./statements/write.js";
import { statusCommand } from "./status.js";
import { stopCommand } from "./stop.js";
import { workspaceGetCommand } from "./workspace/get.js";
import { workspaceGroupCommand } from "./workspace/group.js";
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
  workspaceGroupCommand,
  workspaceListCommand,
  workspaceGetCommand,
  queryGroupCommand,
  queryRunCommand,
  queryListCommand,
  queryGetCommand,
  querySaveCommand,
  statementsGroupCommand,
  statementsWriteCommand,
  statementsDraftCommand,
  graphGroupCommand,
  graphStatusCommand,
  graphListCommand,
  graphGetCommand,
  graphSaveCommand,
  graphBuildCommand,
  graphDefsCommand,
  schemaCommand,
] as const;

export const REGISTRY_COMMAND_SCHEMAS = commandSchemas(ALL_COMMAND_DEFINITIONS);

export { schemaCommand } from "./schema/command.js";
