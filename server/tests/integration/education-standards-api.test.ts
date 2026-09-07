import express from "express";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "@jest/globals";
import { nanoid } from "nanoid";
import { eq } from "drizzle-orm";
import { buildSchoolAnalyticsTestApp } from "../helpers/schoolAnalyticsTestApp";
import { storage } from "../../storage";
import { testDb } from "../helpers/testDatabase";
import { getDb } from "../../db";
import { schools } from "../../../shared/schema";
import { ensureEducationStandardsSchema } from "../../lib/ensure-education-standards-schema";

const describeWithDb = process.env.TEST_DATABASE_URL ? describe : describe.skip;

describeWithDb("Integration: education standards API", () => {
  let app: express.Application;
  let adminEmail: string;

  beforeAll(async () => {
    await testDb.cleanup();
    await ensureEducationStandardsSchema();
  });

  afterAll(async () => {
    await testDb.cleanup();
  });

  beforeEach(async () => {
    app = buildSchoolAnalyticsTestApp();
    await testDb.cleanup();
    await ensureEducationStandardsSchema();

    const uid = nanoid(8).toLowerCase();
    const admin = await testDb.createTestUser({
      username: `edu_adm_${uid}`,
      email: `edu_adm_${uid}@test.com`,
      role: "schoolAdmin",
      name: "Edu Admin",
    });
    const school = await testDb.createTestSchool(admin.id, {
      name: `Edu School ${uid}`,
      registrationCode: `ED${uid.toUpperCase().slice(0, 4)}`,
      state: "NY",
    });
    const db = await getDb();
    await db.update(schools).set({ state: "NY" }).where(eq(schools.id, school.id));
    adminEmail = admin.email;
    await storage.updateUser(admin.id, { schoolId: school.id } as any);
  });

  it("lists jurisdictions with NY + US having standards data", async () => {
    const res = await request(app)
      .get("/api/education-standards/jurisdictions")
      .set("x-test-user-email", adminEmail);

    expect(res.status).toBe(200);
    expect(res.body.resolved.code).toBe("NY");
    const ny = res.body.jurisdictions.find((j: any) => j.code === "NY");
    const us = res.body.jurisdictions.find((j: any) => j.code === "US");
    expect(ny?.hasStandardsData).toBe(true);
    expect(us?.hasKpiData).toBe(true);
  });

  it("returns curated standards for NY ELA", async () => {
    const res = await request(app)
      .get("/api/education-standards?jurisdictionCode=NY&subject=ela")
      .set("x-test-user-email", adminEmail);

    expect(res.status).toBe(200);
    expect(res.body.jurisdiction.code).toBe("NY");
    expect(res.body.standards.length).toBeGreaterThan(0);
    expect(res.body.standards[0].code).toMatch(/^NY-ELA/);
  });

  it("school analytics includes jurisdiction and KPI bands", async () => {
    const res = await request(app)
      .get("/api/progress/analytics/school?jurisdictionCode=NY")
      .set("x-test-user-email", adminEmail);

    expect(res.status).toBe(200);
    expect(res.body.jurisdiction.code).toBe("NY");
    expect(Array.isArray(res.body.proficiencyBands)).toBe(true);
  });
});
