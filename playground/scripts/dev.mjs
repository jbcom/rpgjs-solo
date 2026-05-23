import { spawn } from "node:child_process";
import { writeGeneratedGames } from "./playground-config.mjs";

const games = await writeGeneratedGames();

const commands = [
  {
    name: "launcher",
    args: ["--dir", ".", "dev:launcher", "--host", "0.0.0.0"],
  },
  ...games.map((game) => ({
    name: game.id,
    args: ["--dir", game.path, "dev", "--host", "0.0.0.0"],
  })),
];

const children = commands.map(({ name, args }) => {
  const child = spawn("pnpm", args, {
    cwd: new URL("..", import.meta.url),
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  const prefix = `[${name}]`;
  child.stdout.on("data", (data) => process.stdout.write(`${prefix} ${data}`));
  child.stderr.on("data", (data) => process.stderr.write(`${prefix} ${data}`));
  child.on("exit", (code, signal) => {
    if (signal) {
      return;
    }
    if (code !== 0) {
      console.error(`${prefix} exited with code ${code}`);
      shutdown();
    }
  });

  return child;
});

let shuttingDown = false;

function shutdown() {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) {
      child.kill("SIGTERM");
    }
  }
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
