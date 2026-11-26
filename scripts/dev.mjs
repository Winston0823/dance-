import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const children = [
  spawn(process.execPath, ["--watch", "apps/server/index.mjs"], {
    cwd: root,
    stdio: "inherit",
    env: process.env,
  }),
  spawn(
    process.execPath,
    [
      "node_modules/vite/bin/vite.js",
      "--config",
      "apps/web/vite.config.ts",
      "--host",
      "127.0.0.1",
    ],
    { cwd: root, stdio: "inherit", env: process.env },
  ),
];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  children.forEach((c) => c.kill());
  process.exitCode = code;
}
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
for (const child of children)
  child.on("exit", (code) => {
    if (!stopping) stop(code ?? 1);
  });
