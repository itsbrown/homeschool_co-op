import { describe, expect, it } from "@jest/globals";
import {
  IDEMPOTENCY_CONFLICT_ERROR,
  buildIdempotencyFingerprint,
  createInMemoryIdempotencyStore,
  resolveIdempotentReplay,
  storeIdempotentResponse,
} from "../services/idempotency-helper";
import { buildEquivalentIdempotencyInputs, buildPaymentPlanPolicyMatrix } from "./helpers/paymentPlanPolicyFixtures";

describe("idempotency-helper replay semantics", () => {
  it("builds same fingerprint for equivalent enrollment ID orderings", () => {
    const [first, second] = buildEquivalentIdempotencyInputs();
    const a = buildIdempotencyFingerprint(first);
    const b = buildIdempotencyFingerprint(second);

    expect(a).toBe(b);
  });

  it("payment plan policy matrix substrate is deterministic and includes baseline plans", () => {
    const matrix = buildPaymentPlanPolicyMatrix();
    expect(matrix.map((entry) => entry.paymentPlan)).toEqual(["full", "deposit", "split", "biweekly"]);
    expect(matrix[0].expectedFirstChargeCents).toBe(10000);
  });

  it("returns replay response for same key and same fingerprint", () => {
    const store = createInMemoryIdempotencyStore<{ paymentIntentId: string }>();
    const fingerprint = buildIdempotencyFingerprint({
      parentEmail: "parent@test.com",
      enrollmentIds: [1, 2],
      amountCents: 5000,
      operation: "pay_all",
      schoolId: 2,
    });

    storeIdempotentResponse(store, {
      key: "idem-key-1",
      fingerprint,
      response: { paymentIntentId: "pi_123" },
      createdAtMs: Date.now(),
      ttlMs: 60_000,
    });

    const replay = resolveIdempotentReplay(store, "idem-key-1", fingerprint);
    expect(replay).toEqual({ replay: true, response: { paymentIntentId: "pi_123" } });
  });

  it("throws explicit conflict error for same key with different fingerprint", () => {
    const store = createInMemoryIdempotencyStore<{ ok: boolean }>();
    storeIdempotentResponse(store, {
      key: "idem-key-2",
      fingerprint: "fingerprint-a",
      response: { ok: true },
      createdAtMs: Date.now(),
      ttlMs: 60_000,
    });

    expect(() => resolveIdempotentReplay(store, "idem-key-2", "fingerprint-b")).toThrow(
      IDEMPOTENCY_CONFLICT_ERROR,
    );
  });

  it("treats expired records as miss (no replay)", () => {
    const store = createInMemoryIdempotencyStore<{ ok: boolean }>();
    storeIdempotentResponse(store, {
      key: "idem-key-3",
      fingerprint: "fp",
      response: { ok: true },
      createdAtMs: Date.now() - 10_000,
      ttlMs: 1,
    });

    const replay = resolveIdempotentReplay(store, "idem-key-3", "fp");
    expect(replay).toEqual({ replay: false });
  });

  it("rejects invalid ttl for stored responses", () => {
    const store = createInMemoryIdempotencyStore();
    expect(() =>
      storeIdempotentResponse(store, {
        key: "idem-key-4",
        fingerprint: "fp",
        response: { ok: true },
        ttlMs: 0,
      }),
    ).toThrow("ttlMs must be a positive number");
  });
});
