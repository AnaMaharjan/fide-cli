import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(SCRIPT_DIR, "..");
const DIST_ROOT = resolve(PACKAGE_ROOT, "dist");
const CLI_BIN = resolve(DIST_ROOT, "bin", "fide.js");

const { resolveWorkspaceSelection } = await import(resolve(DIST_ROOT, "util", "workspace-settings.js"));
const { resolveGraphQueryScope } = await import(resolve(DIST_ROOT, "commands", "graph", "query.js"));

async function withEnv(overrides, fn) {
  const restore = new Map();
  for (const [key, value] of Object.entries(overrides)) {
    restore.set(key, process.env[key]);
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  try {
    return await fn();
  } finally {
    for (const [key, value] of restore.entries()) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

function runCli(args, env = process.env) {
  return spawnSync("node", [CLI_BIN, ...args], {
    cwd: resolve(PACKAGE_ROOT, "..", ".."),
    env,
    encoding: "utf8",
  });
}

function readProfileWorkspaceId(profile = "default") {
  const settingsPath = resolve(process.env.HOME ?? "", ".fide", "profiles", profile, "settings.json");
  if (!existsSync(settingsPath)) return null;
  try {
    const parsed = JSON.parse(readFileSync(settingsPath, "utf8"));
    return typeof parsed.workspaceId === "string" && parsed.workspaceId.trim() ? parsed.workspaceId.trim() : null;
  } catch {
    return null;
  }
}

async function main() {
  const noEnvSelection = await withEnv({ FIDE_WORKSPACE_ID: undefined }, () => resolveWorkspaceSelection(new Map()));
  assert.equal(noEnvSelection, null, "workspace selection should be null without flag or env");

  const envSelection = await withEnv({ FIDE_WORKSPACE_ID: "workspace-env" }, () => resolveWorkspaceSelection(new Map()));
  assert.deepEqual(envSelection, {
    path: "env",
    source: "env",
    workspaceId: "workspace-env",
  });

  const flagSelection = await withEnv({ FIDE_WORKSPACE_ID: "workspace-env" }, () =>
    resolveWorkspaceSelection(new Map([["workspace", "workspace-flag"]])));
  assert.deepEqual(flagSelection, {
    path: "--workspace",
    source: "flag",
    workspaceId: "workspace-flag",
  });

  const localScope = await withEnv({ FIDE_WORKSPACE_ID: undefined, FIDE_PROFILE: "work" }, () =>
    resolveGraphQueryScope(new Map()));
  assert.deepEqual(localScope, { targetScope: "local" }, "FIDE_PROFILE must not switch graph query scope");

  const hostedScope = await withEnv({ FIDE_WORKSPACE_ID: "workspace-env" }, () =>
    resolveGraphQueryScope(new Map()));
  assert.deepEqual(hostedScope, {
    targetScope: "workspace",
    workspaceId: "workspace-env",
    workspaceSelectionSource: "env",
  });

  const localList = runCli(["graph", "query", "list"], { ...process.env, FIDE_WORKSPACE_ID: "" });
  assert.equal(localList.status, 0, `local graph query list should succeed: ${localList.stderr}`);
  const localPayload = JSON.parse(localList.stdout);
  assert.equal(localPayload.targetScope, "local");
  assert.equal(typeof localPayload.root, "string");
  assert.equal("workspaceSelectionSource" in localPayload, false);

  const workspaceHelp = runCli(["workspace", "--help"]);
  assert.equal(workspaceHelp.status, 0);
  assert.match(workspaceHelp.stdout, /members/);
  assert.doesNotMatch(workspaceHelp.stdout, /\bsettings\b/);

  const schema = runCli(["schema"]);
  assert.equal(schema.status, 0);
  const schemaPayload = JSON.parse(schema.stdout);
  assert.equal(schemaPayload.surfaces.includes("workspace.settings.get"), false);
  assert.equal(schemaPayload.surfaces.includes("workspace.settings.set"), false);

  const hostedWorkspaceId = readProfileWorkspaceId();
  if (hostedWorkspaceId) {
    const hostedList = runCli(["graph", "query", "list"], { ...process.env, FIDE_WORKSPACE_ID: hostedWorkspaceId });
    if (hostedList.status === 0) {
      const hostedPayload = JSON.parse(hostedList.stdout);
      assert.equal(hostedPayload.targetScope, "workspace");
      assert.equal(hostedPayload.workspaceId, hostedWorkspaceId);
      assert.equal(hostedPayload.workspaceSelectionSource, "env");
    } else {
      console.warn(`Skipping hosted graph query smoke: ${hostedList.stderr.trim()}`);
    }
  } else {
    console.warn("Skipping hosted graph query smoke: no stored profile workspaceId found.");
  }

  console.log("Scope model checks passed.");
}

await main();
