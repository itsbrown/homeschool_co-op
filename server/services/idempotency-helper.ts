import { createHash } from "crypto";

export interface IdempotencyFingerprintInput {
  parentEmail: string;
  enrollmentIds: number[];
  amountCents: number;
  operation: string;
  schoolId?: number | null;
}

export interface IdempotencyRecord<T = unknown> {
  key: string;
  fingerprint: string;
  createdAtMs: number;
  expiresAtMs: number;
  response: T;
}

export interface IdempotencyStore<T = unknown> {
  get(key: string): IdempotencyRecord<T> | undefined;
  set(record: IdempotencyRecord<T>): void;
  delete(key: string): void;
}

/** Stable, deterministic fingerprint for Pay All-style operations. */
export function buildIdempotencyFingerprint(input: IdempotencyFingerprintInput): string {
  const normalized = {
    parentEmail: String(input.parentEmail || "").trim().toLowerCase(),
    enrollmentIds: [...input.enrollmentIds].sort((a, b) => a - b),
    amountCents: input.amountCents,
    operation: String(input.operation || "").trim(),
    schoolId: input.schoolId ?? null,
  };

  const raw = JSON.stringify(normalized);
  return createHash("sha256").update(raw).digest("hex");
}

export function createInMemoryIdempotencyStore<T = unknown>(): IdempotencyStore<T> {
  const map = new Map<string, IdempotencyRecord<T>>();

  return {
    get(key) {
      const record = map.get(key);
      if (!record) return undefined;
      if (Date.now() > record.expiresAtMs) {
        map.delete(key);
        return undefined;
      }
      return record;
    },
    set(record) {
      map.set(record.key, record);
    },
    delete(key) {
      map.delete(key);
    },
  };
}

/**
 * Returns cached response on idempotent replay. Throws on conflicting payload fingerprint.
 */
export function resolveIdempotentReplay<T>(
  store: IdempotencyStore<T>,
  key: string,
  fingerprint: string,
): { replay: true; response: T } | { replay: false } {
  const existing = store.get(key);
  if (!existing) return { replay: false };

  if (existing.fingerprint !== fingerprint) {
    throw new Error("IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD");
  }

  return { replay: true, response: existing.response };
}
