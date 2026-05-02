import { readFileSync, existsSync, unlinkSync } from 'node:fs';

const PID_FILE = '/tmp/jest-server-pid.txt';

export default async function globalTeardown() {
  if (!existsSync(PID_FILE)) return;
  const raw = readFileSync(PID_FILE, 'utf8').trim();
  unlinkSync(PID_FILE);
  if (!raw) return;
  const pid = Number.parseInt(raw, 10);
  if (!Number.isFinite(pid) || pid <= 0) return;
  try {
    process.kill(pid, 'SIGTERM');
    console.log(`[jest globalTeardown] sent SIGTERM to dev server pid=${pid}`);
  } catch (err) {
    console.warn(`[jest globalTeardown] could not signal pid=${pid}:`, err?.message ?? err);
  }
}
