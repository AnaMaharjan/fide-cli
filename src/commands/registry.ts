import { commandSchemas, type CommandDefinition } from "../util/command/command-metadata.js";
import { authLoginCommand } from "./auth/login.js";
import { authLogoutCommand } from "./auth/logout.js";
import { authWhoamiCommand } from "./auth/whoami.js";
import { docsCommand } from "./docs.js";
import { graphBuildCommand } from "./graph/build.js";
import { graphGetCommand } from "./graph/get.js";
import { graphListCommand } from "./graph/list.js";
import { graphSaveCommand } from "./graph/save.js";
import { graphStatusCommand } from "./graph/status.js";
import { queryGetCommand } from "./query/get.js";
import { queryListCommand } from "./query/list.js";
import { queryRunCommand } from "./query/run.js";
import { querySaveCommand } from "./query/save.js";
import { schemaCommand } from "./schema/command.js";
import { startCommand } from "./start.js";
import { statementsDraftCommand } from "./statements/draft.js";
import { statementsGuideCommand } from "./statements/guide.js";
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
  workspaceListCommand,
  workspaceGetCommand,
  queryRunCommand,
  queryListCommand,
  queryGetCommand,
  querySaveCommand,
  statementsWriteCommand,
  statementsDraftCommand,
  statementsGuideCommand,
  graphStatusCommand,
  graphListCommand,
  graphGetCommand,
  graphSaveCommand,
  graphBuildCommand,
  schemaCommand,
] as const;

export const REGISTRY_COMMAND_SCHEMAS = commandSchemas(ALL_COMMAND_DEFINITIONS);

export { schemaCommand } from "./schema/command.js";
