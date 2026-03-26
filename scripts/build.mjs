import { spawnSync } from "node:child_process";

function run(cmd, args) {
  const result = spawnSync(cmd, args, { stdio: "inherit" });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

run("pnpm", ["run", "generate:schema"]);
run("pnpm", ["exec", "tsc", "-p", "tsconfig.json"]);

if (process.argv.includes("--link")) {
  run("npm", ["link"]);
}
