#!/usr/bin/env node
/**
 * Frees TCP port 5000 before `npm run dev` so Replit / local restarts do not hit
 * EADDRINUSE when a prior tsx/node process did not release the listener.
 */
import { execSync } from "node:child_process";
import { platform } from "node:os";

function sh(cmd) {
  try {
    execSync(cmd, { stdio: "ignore", shell: "/bin/sh" });
  } catch {
    /* ignore — port may be free or we lack permission */
  }
}

const isDarwin = platform() === "darwin";

if (isDarwin) {
  sh('pids=$(lsof -ti tcp:5000 2>/dev/null); [ -n "$pids" ] && kill -9 $pids 2>/dev/null');
} else {
  sh("fuser -k 5000/tcp 2>/dev/null");
  sh(
    'for pid in $(lsof -t -iTCP:5000 -sTCP:LISTEN 2>/dev/null); do kill -9 "$pid" 2>/dev/null; done',
  );
}
