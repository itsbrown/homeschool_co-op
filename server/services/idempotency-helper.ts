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

export const IDEMPOTENCY_CONFLICT_ERROR = "IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD";

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
    throw new Error(IDEMPOTENCY_CONFLICT_ERROR);
  }

  return { replay: true, response: existing.response };
}

/** Save a successful response to store for future replays. */
export function storeIdempotentResponse<T>(
  store: IdempotencyStore<T>,
  input: {
    key: string;
    fingerprint: string;
    response: T;
    createdAtMs?: number;
    ttlMs: number;
  },
): IdempotencyRecord<T> {
  if (!Number.isFinite(input.ttlMs) || input.ttlMs <= 0) {
    throw new Error("ttlMs must be a positive number");
  }

  const createdAtMs = input.createdAtMs ?? Date.now();
  const record: IdempotencyRecord<T> = {
    key: input.key,
    fingerprint: input.fingerprint,
    response: input.response,
    createdAtMs,
    expiresAtMs: createdAtMs + input.ttlMs,
  };
  store.set(record);
  return record;
}
