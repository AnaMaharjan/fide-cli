import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const cliPackageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const daemonPackageRoot = resolve(cliPackageRoot, "../daemon");

function run(cmd, args) {
  const result = spawnSync(cmd, args, { stdio: "inherit" });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

run("pnpm", ["run", "--dir", daemonPackageRoot, "build"]);
run("pnpm", ["run", "generate:schema"]);
run("pnpm", ["exec", "tsc", "-p", "tsconfig.json"]);

if (process.argv.includes("--link")) {
  run("npm", ["link"]);
}
