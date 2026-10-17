// Build entry used by `npm run build` on hosts (Hostinger, Render, …).
// Some hosts set NODE_ENV=production during install, which makes npm skip devDependencies
// (turbo, typescript, tailwind, esbuild…). The build needs them, so install them here if missing.
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

const win = process.platform === "win32";
const run = (cmd, args) => {
  const r = spawnSync(cmd, args, { stdio: "inherit", shell: win });
  if (r.status !== 0) process.exit(r.status ?? 1);
};
const turbo = `node_modules/.bin/turbo${win ? ".cmd" : ""}`;

if (!existsSync(turbo)) {
  console.log("==> Build tools missing (devDependencies were skipped). Installing them now…");
  run("npm", ["install", "--include=dev", "--no-audit", "--no-fund"]);
}
run(turbo, ["run", "build"]);
