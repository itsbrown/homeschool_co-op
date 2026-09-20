import { describe, expect, it } from "@jest/globals";
import {
  ADMIN_ENROLLMENT_DELETE_ACTION,
  PARENT_CART_REMOVE_ACTION,
  buildEnrollmentHardDeleteAuditLog,
  enrollmentHardDeleteSnapshot,
  numericActorId,
} from "../../lib/enrollment-hard-delete-audit";

const row = {
  id: 790,
  schoolId: 2,
  childId: 157,
  childName: "Amelia Campbell",
  className: "Fall 2026 - Full Day",
  parentId: 128,
  parentEmail: "yetter.j8@gmail.com",
  sessionId: 2,
  dayType: "full_day" as const,
  status: "pending_payment",
  paymentStatus: "pending",
  totalCost: 150000,
  totalPaid: 0,
  remainingBalance: 150000,
  effectiveBalance: 150000,
  enrollmentVersion: "v2",
  marketplaceClassId: null,
  notes: "Admin enroll — Fall 2026 Full Day pending",
};

describe("enrollmentHardDeleteSnapshot", () => {
  it("keeps payable seat fields after the row is gone", () => {
    expect(enrollmentHardDeleteSnapshot(row)).toMatchObject({
      id: 790,
      childName: "Amelia Campbell",
      sessionId: 2,
      dayType: "full_day",
      totalCost: 150000,
      totalPaid: 0,
      parentId: 128,
    });
  });
});

describe("buildEnrollmentHardDeleteAuditLog", () => {
  it("tags parent cart-remove with actor email and source", () => {
    const log = buildEnrollmentHardDeleteAuditLog({
      enrollment: row,
      actor: { id: 128, role: "parent", email: "yetter.j8@gmail.com" },
      source: "parent_cancel_multiple",
    });
    expect(log.actionType).toBe(PARENT_CART_REMOVE_ACTION);
    expect(log.actorId).toBe(128);
    expect(log.actorEmail).toBe("yetter.j8@gmail.com");
    expect(log.targetId).toBe("790");
    expect(log.metadata).toMatchObject({
      source: "parent_cancel_multiple",
      enrollment: { id: 790, totalCost: 150000 },
    });
  });

  it("does not store a Supabase UUID on actor_id", () => {
    const log = buildEnrollmentHardDeleteAuditLog({
      enrollment: row,
      actor: { id: "c13ef685-e8f4-4e05-8946-94e94f58fff8", email: "yetter.j8@gmail.com" },
      source: "parent_unenroll",
    });
    expect(log.actorId).toBeNull();
    expect(log.actorEmail).toBe("yetter.j8@gmail.com");
  });

  it("nulls a Supabase UUID on actor_id", () => {
    expect(numericActorId("c13ef685-e8f4-4e05-8946-94e94f58fff8")).toBeNull();
    expect(numericActorId(128)).toBe(128);
  });

  it("uses the admin action for office deletes", () => {
    const log = buildEnrollmentHardDeleteAuditLog({
      enrollment: row,
      actor: { id: 1, role: "schoolAdmin", email: "admin@test.com" },
      source: "admin_delete",
    });
    expect(log.actionType).toBe(ADMIN_ENROLLMENT_DELETE_ACTION);
  });
});
