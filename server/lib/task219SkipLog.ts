/**
 * Task #219 — In-memory ring buffer of recent payment_intent.succeeded skip
 * events, used by the regression test (`cart-pi-persistence-regression.test.ts`)
 * to assert that EVERY skip branch in `server/webhook-handler.ts` emits a
 * structured log alongside its `console.warn` call.
 *
 * Why a buffer and not log scraping: jest cannot reliably read the dev-server
 * stdout, and tailing `/tmp/logs/*.log` is racy. A bounded in-process buffer
 * keyed by `eventId` lets the test query exactly the entries it just produced.
 *
 * The buffer holds at most 256 entries; older entries are evicted FIFO. It is
 * a no-op when `NODE_ENV === 'production'` so it cannot accumulate memory in
 * the deployed environment.
 */

export interface Task219SkipEntry {
  ts: number;
  eventId: string;
  eventType: string;
  paymentIntentId: string;
  reason: string;
  metadataKey: string;
  metadataValue: string | null;
  persistedRowId: number | null;
}

const MAX_ENTRIES = 256;
const buffer: Task219SkipEntry[] = [];

export function recordTask219Skip(entry: Omit<Task219SkipEntry, 'ts'>): void {
  if (process.env.NODE_ENV === 'production') return;
  buffer.push({ ts: Date.now(), ...entry });
  if (buffer.length > MAX_ENTRIES) {
    buffer.splice(0, buffer.length - MAX_ENTRIES);
  }
}

export function getTask219SkipsForEvent(eventId: string): Task219SkipEntry[] {
  return buffer.filter((e) => e.eventId === eventId);
}
