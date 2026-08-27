import express from "express";
import request from "supertest";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, expect, it } from "@jest/globals";
import { nanoid } from "nanoid";
import { sessions } from "@shared/schema";
import { MEMBERS_ONLY_ENROLLMENT_NOTICE } from "@shared/member-id-enrollment-gate";
import { TestDatabase } from "../helpers/testDatabase";
import { describeIntegration } from "../helpers/integrationDb";
import { getDb } from "../../db";
import adminSessionsRouter from "../../api/admin-sessions";
import sessionEnrollmentsRouter from "../../api/session-enrollments";
import classesRouter from "../../api/classes";

describeIntegration("Integration: member-ID enrollment gate", () => {
  const testDb = new TestDatabase();
  let app: express.Application;

  beforeAll(async () => {
    const db = await getDb();
    await db.execute(sql`
      ALTER TABLE sessions
      ADD COLUMN IF NOT EXISTS require_member_id BOOLEAN NOT NULL DEFAULT false
    `);
    await db.execute(sql`
      ALTER TABLE classes
      ADD COLUMN IF NOT EXISTS require_member_id BOOLEAN NOT NULL DEFAULT false
    `);
  });

  afterAll(async () => {
    await testDb.cleanup();
  });

  beforeEach(async () => {
    await testDb.cleanup();
    app = express();
    app.use(express.json());
    app.use("/api/admin/sessions", adminSessionsRouter);
    app.use("/api/session-enrollments", sessionEnrollmentsRouter);
    app.use("/api/classes", classesRouter);
  });

  async function seedFamily(opts: { requireMemberId: boolean; memberId?: string | null }) {
    const uid = nanoid(8).toLowerCase();
    const admin = await testDb.createTestUser({
      email: `mid_admin_${uid}@test.com`,
      username: `mid_admin_${uid}`,
      role: "schoolAdmin",
      name: "Member Gate Admin",
    });
    const school = await testDb.createTestSchool(admin.id, {
      name: `Member Gate School ${uid}`,
      registrationCode: `MID${uid.toUpperCase().slice(0, 6)}`,
    });
    const parent = await testDb.createTestUser({
      email: `mid_parent_${uid}@test.com`,
      username: `mid_parent_${uid}`,
      role: "parent",
      name: "Member Gate Parent",
      schoolId: school.id,
      memberId: opts.memberId ?? null,
    });
    const child = await testDb.createTestChild(parent.id, {
      firstName: "Kid",
      lastName: uid,
      schoolId: school.id,
    });
    const db = await getDb();
    const today = new Date().toISOString().slice(0, 10);
    const end = new Date();
    end.setMonth(end.getMonth() + 3);
    const [session] = await db
      .insert(sessions)
      .values({
        schoolId: school.id,
        name: `Gated Session ${uid}`,
        startDate: today,
        endDate: end.toISOString().slice(0, 10),
        status: "upcoming",
        enrollmentOpen: true,
        requireMemberId: opts.requireMemberId,
        halfDayPrice: 10000,
        fullDayPrice: 20000,
        sortOrder: 0,
      })
      .returning();
    const cls = await testDb.createTestClass(school.id, {
      title: `Gated Class ${uid}`,
      description: "Members-only class",
      category: "Academic",
      status: "upcoming",
      type: "school_admin",
      price: 5000,
      enrollmentOpen: true,
      requireMemberId: opts.requireMemberId,
      isAdminOnly: false,
      instructorId: admin.id,
    });
    return { admin, school, parent, child, session, cls };
  }

  it("hides requireMemberId sessions from parents without a member ID", async () => {
    const seed = await seedFamily({ requireMemberId: true });
    const res = await request(app)
      .get("/api/admin/sessions/open")
      .set("x-test-user-email", seed.parent.email);
    expect(res.status).toBe(200);
    expect(res.body.sessions).toEqual([]);
    expect(res.body.membersOnlyNotices[0].sessionId).toBe(seed.session.id);
    expect(res.body.membersOnlyNotices[0].message).toBe(MEMBERS_ONLY_ENROLLMENT_NOTICE);
  });

  it("returns open sessions when the parent has a member ID", async () => {
    const seed = await seedFamily({ requireMemberId: true, memberId: "ASA-2026-TEST01" });
    const res = await request(app)
      .get("/api/admin/sessions/open")
      .set("x-test-user-email", seed.parent.email);
    expect(res.status).toBe(200);
    expect(res.body.sessions.map((s: { id: number }) => s.id)).toContain(seed.session.id);
    expect(res.body.membersOnlyNotices ?? []).toEqual([]);
  });

  it("rejects session enroll without a member ID", async () => {
    const seed = await seedFamily({ requireMemberId: true });
    const res = await request(app)
      .post("/api/session-enrollments")
      .set("x-test-user-email", seed.parent.email)
      .send({
        childIds: [seed.child.id],
        sessionIds: [seed.session.id],
        variant: "full_day",
      });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("MEMBER_ID_REQUIRED");
  });

  it("allows session enroll when the parent has a member ID", async () => {
    const seed = await seedFamily({ requireMemberId: true, memberId: "ASA-2026-TEST02" });
    const res = await request(app)
      .post("/api/session-enrollments")
      .set("x-test-user-email", seed.parent.email)
      .send({
        childIds: [seed.child.id],
        sessionIds: [seed.session.id],
        variant: "full_day",
      });
    expect(res.status).toBe(200);
    expect(res.body.enrollments?.length ?? 0).toBeGreaterThan(0);
  });

  it("hides requireMemberId classes from the public catalog", async () => {
    const seed = await seedFamily({ requireMemberId: true });
    const res = await request(app).get("/api/classes");
    expect(res.status).toBe(200);
    const list = res.body.classes ?? [];
    expect(list.some((c: { id: number }) => c.id === seed.cls.id)).toBe(false);
  });

  it("rejects class enroll without a member ID and allows schoolAdmin bypass", async () => {
    const seed = await seedFamily({ requireMemberId: true });
    const denied = await request(app)
      .post(`/api/classes/${seed.cls.id}/enroll`)
      .set("x-test-user-email", seed.parent.email)
      .send({ childId: seed.child.id });
    expect(denied.status).toBe(403);
    expect(denied.body.code).toBe("MEMBER_ID_REQUIRED");

    const office = await request(app)
      .post(`/api/classes/${seed.cls.id}/enroll`)
      .set("x-test-user-email", seed.admin.email)
      .send({ childId: seed.child.id });
    expect(office.status).toBe(200);
  });
});
