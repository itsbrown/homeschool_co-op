#!/usr/bin/env node
/**
 * Frees TCP port 5000 before `npm run dev` so Replit / local restarts do not hit
 * EADDRINUSE when a prior tsx/node process did not release the listener.
 *
 * Always logs a few lines so `npm run dev` visibly "did something" in the shell.
 */
import { execSync } from "node:child_process";
import { platform } from "node:os";

function capture(cmd) {
  try {
    return execSync(cmd, { encoding: "utf8", shell: "/bin/sh", stdio: "pipe" }).trim();
  } catch {
    return "";
  }
}

function shQuiet(cmd) {
  try {
    execSync(cmd, { stdio: "ignore", shell: "/bin/sh" });
  } catch {
    /* ignore */
  }
}

console.log("[predev] Checking for processes still listening on port 5000…");

const isDarwin = platform() === "darwin";
let pids = "";
if (isDarwin) {
  pids = capture("lsof -ti tcp:5000 2>/dev/null");
} else {
  pids = capture("lsof -t -iTCP:5000 -sTCP:LISTEN 2>/dev/null");
  if (!pids) pids = capture("lsof -t -i:5000 2>/dev/null");
}

if (pids) {
  const unique = [...new Set(pids.split(/\s+/).filter(Boolean))];
  console.log("[predev] Sending SIGKILL to PID(s):", unique.join(" "));
  for (const pid of unique) {
    try {
      process.kill(Number(pid), "SIGKILL");
    } catch {
      shQuiet(`kill -9 "${pid}" 2>/dev/null`);
    }
  }
} else {
  console.log("[predev] lsof did not report any PID on :5000 (port may already be free).");
}

if (!isDarwin) {
  shQuiet("fuser -k 5000/tcp 2>/dev/null");
}

console.log(
  "[predev] Finished. Starting dev server (leave this running; use Repl Stop when done)…\n",
);
