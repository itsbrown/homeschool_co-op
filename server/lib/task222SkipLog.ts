/**
 * Task #222 — In-memory ring buffer of recent refund-webhook skip events,
 * used by the regression test (`refund-event-persistence-regression.test.ts`)
 * to assert that EVERY skip branch in the refund handlers in
 * `server/webhook-handler.ts` emits a structured log alongside its
 * `console.warn` call.
 *
 * Mirrors the design of `task219SkipLog.ts` for symmetry.
 */

export interface Task222SkipEntry {
  ts: number;
  eventId: string;
  eventType: string;
  refundId: string | null;
  paymentIntentId: string | null;
  reason: string;
  metadataKey: string;
  metadataValue: string | null;
  persistedRowId: number | null;
}

const MAX_ENTRIES = 256;
const buffer: Task222SkipEntry[] = [];

export function recordTask222Skip(entry: Omit<Task222SkipEntry, 'ts'>): void {
  if (process.env.NODE_ENV === 'production') return;
  buffer.push({ ts: Date.now(), ...entry });
  if (buffer.length > MAX_ENTRIES) {
    buffer.splice(0, buffer.length - MAX_ENTRIES);
  }
}

export function getTask222SkipsForEvent(eventId: string): Task222SkipEntry[] {
  return buffer.filter((e) => e.eventId === eventId);
}
