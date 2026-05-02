import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:5000';
const PID_FILE = '/tmp/jest-server-pid.txt';

async function isHealthy() {
  try {
    const res = await fetch(BASE_URL, { method: 'GET' });
    return res.status < 500;
  } catch {
    return false;
  }
}

export default async function globalSetup() {
  // PAYMENT_PROCESSOR_ENABLED is intentionally NOT defaulted here. The
  // strict guard in server/tests/setup.ts is the single source of truth
  // and must fail loudly when the var is missing — silently filling it
  // in would mask exactly the config drift this harness is meant to
  // catch (Task #203 finding tracking).
  if (await isHealthy()) {
    console.log(`[jest globalSetup] reusing existing server at ${BASE_URL}`);
    writeFileSync(PID_FILE, '');
    return;
  }

  console.log('[jest globalSetup] spawning dev server (npx tsx server/index.ts)...');
  const child = spawn('npx', ['tsx', 'server/index.ts'], {
    env: { ...process.env, NODE_ENV: 'development' },
    stdio: ['ignore', 'inherit', 'inherit'],
    detached: true,
  });
  child.unref();
  writeFileSync(PID_FILE, String(child.pid ?? ''));

  for (let i = 0; i < 90; i++) {
    if (await isHealthy()) {
      console.log(`[jest globalSetup] dev server ready after ${i}s`);
      return;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error('[jest globalSetup] dev server failed to start within 90s');
}
