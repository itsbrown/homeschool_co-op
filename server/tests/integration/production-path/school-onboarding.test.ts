import { beforeAll, expect, it } from "@jest/globals";
import type { Application } from "express";
import request from "supertest";
import { describeProductionPath } from "../../helpers/describeProductionPath";
import { createTenantIsolationApp } from "../../helpers/tenantIsolationApp";
import { testDb } from "../../helpers/testDatabase";
import { storage } from "../../../storage";

function applicationBody(email: string, schoolName: string) {
  return {
    schoolName,
    schoolType: "homeschool_coop",
    adminFirstName: "New",
    adminLastName: "Admin",
    adminEmail: email,
    adminPhone: "555-0100",
    address: "1 Main",
    city: "Rochester",
    state: "NY",
    zipCode: "14618",
    website: "",
    currentStudentCount: 12,
    gradelevelsServed: ["K-5"],
    establishedYear: 2020,
    reasonForJoining: "We need a shared roster, registration, and billing home for our co-op families.",
    currentChallenges: "Spreadsheets and a shared inbox are not enough.",
    expectedStudentGrowth: 5,
    reference1Name: "Ref One",
    reference1Email: "ref@example.com",
    reference1Relationship: "Board member",
    agreesToTerms: true,
    agreesToDataSharing: true,
  };
}

describeProductionPath("production-path: school onboarding", () => {
  let app: Application;

  beforeAll(() => {
    app = createTenantIsolationApp();
  });

  it("creates a school and schoolAdmin role when a superAdmin approves", async () => {
    const email = `coop-${Date.now()}@example.com`;
    const created = await request(app)
      .post("/api/school-applications")
      .send(applicationBody(email, "North Co-op"));
    expect(created.status).toBe(201);

    const superAdmin = await testDb.createTestUser({ role: "superAdmin" });
    const approved = await request(app)
      .patch(`/api/school-applications/${created.body.applicationId}/status`)
      .set("x-test-user-email", superAdmin.email)
      .send({ status: "approved", reviewNotes: "Looks ready" });
    expect(approved.status).toBe(200);
    expect(approved.body.registrationCode).toBeTruthy();
    expect(approved.body.schoolId).toBeTruthy();

    const user = await storage.getUserByEmail(email);
    expect(user?.role).toBe("schoolAdmin");
    const roles = await storage.getUserRolesByUserId(user!.id);
    expect(roles.some((row) => row.role === "schoolAdmin" && row.schoolId === approved.body.schoolId)).toBe(true);
    const school = await storage.getSchool(approved.body.schoolId);
    expect(school?.registrationCode).toBe(approved.body.registrationCode);
    expect(school?.adminId).toBe(user!.id);
  });

  it("links an existing parent without moving their family school", async () => {
    const home = await testDb.createTestUser({ role: "schoolAdmin" });
    const asa = await testDb.createTestSchool(home.id, { name: "Home School" });
    const parent = await testDb.createTestUser({
      role: "parent",
      schoolId: asa.id,
      email: `parent-apply-${Date.now()}@example.com`,
    });
    const created = await request(app)
      .post("/api/school-applications")
      .send(applicationBody(parent.email, "Second Co-op"));
    expect(created.status).toBe(201);
    const superAdmin = await testDb.createTestUser({ role: "superAdmin" });
    const approved = await request(app)
      .patch(`/api/school-applications/${created.body.applicationId}/status`)
      .set("x-test-user-email", superAdmin.email)
      .send({ status: "approved", reviewNotes: "Existing parent" });
    expect(approved.status).toBe(200);

    const updated = await storage.getUserByEmail(parent.email);
    expect(updated?.role).toBe("parent");
    expect(updated?.schoolId).toBe(asa.id);
    const roles = await storage.getUserRolesByUserId(parent.id);
    expect(roles.some((row) => row.role === "schoolAdmin" && row.schoolId === approved.body.schoolId)).toBe(true);
    expect(roles.some((row) => row.role === "schoolAdmin" && row.schoolId === asa.id)).toBe(false);
  });

  it("requires a reason when declining", async () => {
    const created = await request(app)
      .post("/api/school-applications")
      .send(applicationBody(`decline-${Date.now()}@example.com`, "Declined Co-op"));
    expect(created.status).toBe(201);
    const superAdmin = await testDb.createTestUser({ role: "superAdmin" });
    const missing = await request(app)
      .patch(`/api/school-applications/${created.body.applicationId}/status`)
      .set("x-test-user-email", superAdmin.email)
      .send({ status: "declined", reviewNotes: "no" });
    expect(missing.status).toBe(400);
    const declined = await request(app)
      .patch(`/api/school-applications/${created.body.applicationId}/status`)
      .set("x-test-user-email", superAdmin.email)
      .send({ status: "declined", reviewNotes: "Not a fit this year" });
    expect(declined.status).toBe(200);
    const stored = await storage.getSchoolApplicationById(created.body.applicationId);
    expect(stored?.status).toBe("declined");
    expect(stored?.rejectionReason || stored?.reviewNotes).toContain("Not a fit");
  });
});
