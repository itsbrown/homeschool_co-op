import { beforeAll, beforeEach, expect, it } from "@jest/globals";
import type { Application } from "express";
import request from "supertest";
import { describeProductionPath } from "../../helpers/describeProductionPath";
import { createAuthzLockdownApp } from "../../helpers/authzLockdownApp";
import { testDb } from "../../helpers/testDatabase";
import { storage } from "../../../storage";

type Fixture = {
  schoolAdminEmail: string;
  otherAdminEmail: string;
  parentEmail: string;
  otherParentEmail: string;
  superAdminEmail: string;
  superAdminId: number;
  educatorEmail: string;
  schoolId: number;
  otherSchoolId: number;
  registrationCode: string;
  childId: number;
  locationId: number;
  otherLocationId: number;
};

describeProductionPath("production-path: authz lockdown", () => {
  let app: Application;
  let fx: Fixture;

  beforeAll(() => {
    app = createAuthzLockdownApp();
  });

  beforeEach(async () => {
    const schoolAdmin = await testDb.createTestUser({ role: "schoolAdmin" });
    const school = await testDb.createTestSchool(schoolAdmin.id, {
      registrationCode: `LOCK${schoolAdmin.id}`,
    });
    const otherAdmin = await testDb.createTestUser({ role: "schoolAdmin" });
    const otherSchool = await testDb.createTestSchool(otherAdmin.id, {
      registrationCode: `OTHR${otherAdmin.id}`,
    });
    await testDb.updateUserSchoolId(schoolAdmin.id, otherSchool.id);
    await testDb.updateUserSchoolId(otherAdmin.id, otherSchool.id);

    const parent = await testDb.createTestUser({ role: "parent", schoolId: school.id });
    const child = await testDb.createTestChild(parent.id, {
      schoolId: school.id,
      firstName: "Ada",
    });
    const otherParent = await testDb.createTestUser({
      role: "parent",
      schoolId: otherSchool.id,
    });
    await testDb.createTestChild(otherParent.id, {
      schoolId: otherSchool.id,
      firstName: "Bea",
    });
    const superAdmin = await testDb.createTestUser({ role: "superAdmin" });
    const educator = await testDb.createTestUser({
      role: "educator",
      schoolId: school.id,
    });
    const location = await testDb.createTestLocation(school.id);
    const otherLocation = await testDb.createTestLocation(otherSchool.id);

    fx = {
      schoolAdminEmail: schoolAdmin.email,
      otherAdminEmail: otherAdmin.email,
      parentEmail: parent.email,
      otherParentEmail: otherParent.email,
      superAdminEmail: superAdmin.email,
      superAdminId: superAdmin.id,
      educatorEmail: educator.email,
      schoolId: school.id,
      otherSchoolId: otherSchool.id,
      registrationCode: school.registrationCode!,
      childId: child.id,
      locationId: location.id,
      otherLocationId: otherLocation.id,
    };
  });

  function asUser(email?: string) {
    const agent = request(app);
    const withAuth = (req: request.Test) => (email ? req.set("x-test-user-email", email) : req);
    return {
      get: (url: string) => withAuth(agent.get(url)),
      post: (url: string) => withAuth(agent.post(url)),
    };
  }

  it("rejects anonymous reads of child, roster, admin, and migration routes", async () => {
    const anon = asUser();
    const urls = [
      `/api/children/${fx.childId}`,
      `/api/children/${fx.childId}/enrollments`,
      "/api/schools",
      `/api/schools/${fx.schoolId}`,
      `/api/schools/${fx.schoolId}/students`,
      "/api/school-admin/debug-users",
      "/api/migration/status",
      "/api/admin/backups",
      "/api/admin/role-invitations",
      "/api/school-applications",
      `/api/users/role/${encodeURIComponent(fx.parentEmail)}`,
      "/api/educator/classes",
      `/api/school-admin/students/by-location/${fx.locationId}`,
      `/api/admin-users/users/email/${encodeURIComponent(fx.parentEmail)}`,
      "/api/schools/knowledge-bases",
      "/api/stripe-migration/status",
    ];

    for (const url of urls) {
      const res = await anon.get(url);
      expect(res.status).toBe(401);
    }

    expect((await anon.post("/api/schools")).status).toBe(401);
    expect((await anon.post("/api/payment-import/upload-payments")).status).toBe(401);
    expect((await anon.post("/api/payment-cleanup/migrate-to-stripe")).status).toBe(401);
    expect((await anon.post("/api/ocr-test/process")).status).toBe(401);
    expect((await anon.post("/api/school-applications/check-status").send({ email: fx.parentEmail })).status).toBe(401);
  });

  it("keeps school-code lookup public and school application submit unauthenticated", async () => {
    const anon = asUser();
    const code = await anon.get(`/api/schools/validate-code/${fx.registrationCode}`);
    expect(code.status).toBe(200);
    expect(code.body.id).toBe(fx.schoolId);
    expect(code.body).not.toHaveProperty("adminId");

    const byCode = await anon.get(`/api/schools/by-code/${fx.registrationCode}`);
    expect(byCode.status).toBe(200);
    expect(byCode.body.id).toBe(fx.schoolId);
    expect(byCode.body.registrationCode).toBe(fx.registrationCode);
    expect(byCode.body).not.toHaveProperty("adminId");
    expect(byCode.body).not.toHaveProperty("membershipAgreementTemplate");

    const submit = await anon.post("/api/school-applications").send({});
    expect(submit.status).toBe(400);

    const school = await storage.getSchool(fx.schoolId);
    expect(school?.registrationCode).toBe(fx.registrationCode);
  });

  it("lets a parent read only their own child and blocks school-wide and admin routes", async () => {
    const parent = asUser(fx.parentEmail);
    const otherChild = await testDb.createTestChild(
      (await storage.getUserByEmail(fx.otherParentEmail))!.id,
      { schoolId: fx.otherSchoolId, firstName: "Cara" },
    );

    const own = await parent.get(`/api/children/${fx.childId}`);
    expect(own.status).toBe(200);
    expect(own.body.firstName).toBe("Ada");

    const enrollments = await parent.get(`/api/children/${fx.childId}/enrollments`);
    expect(enrollments.status).toBe(200);
    expect(Array.isArray(enrollments.body)).toBe(true);

    expect((await parent.get(`/api/children/${otherChild.id}`)).status).toBe(403);
    expect((await parent.get("/api/schools")).status).toBe(403);
    expect((await parent.get(`/api/schools/${fx.schoolId}/students`)).status).toBe(403);
    expect((await parent.get("/api/school-admin/debug-users")).status).toBe(403);
    expect((await parent.get("/api/migration/status")).status).toBe(403);
    expect((await parent.get("/api/admin/backups")).status).toBe(403);
    expect((await parent.get("/api/admin/role-invitations")).status).toBe(403);
    expect((await parent.get("/api/school-applications")).status).toBe(403);
    expect((await parent.get("/api/educator/classes")).status).toBe(403);
    expect((await parent.get(`/api/school-admin/students/by-location/${fx.locationId}`)).status).toBe(403);
    expect((await parent.post("/api/schools").send({ name: "Nope" })).status).toBe(403);
    expect((await parent.post("/api/payment-import/upload-payments")).status).toBe(403);
    expect(
      (await parent.get(`/api/admin-users/users/email/${encodeURIComponent(fx.parentEmail)}`)).status,
    ).toBe(403);
    expect(
      (await parent.post("/api/school-applications/check-status").send({ email: fx.otherParentEmail })).status,
    ).toBe(403);

    const ownStatus = await parent
      .post("/api/school-applications/check-status")
      .send({ email: fx.parentEmail });
    expect(ownStatus.status).toBe(200);
    expect(Array.isArray(ownStatus.body.applications)).toBe(true);
    expect(JSON.stringify(ownStatus.body)).not.toContain("adminPhone");

    const ownRole = await parent.get(`/api/users/role/${encodeURIComponent(fx.parentEmail)}`);
    expect(ownRole.status).toBe(200);
    expect(ownRole.body.role).toBe("parent");
    expect((await parent.get(`/api/users/role/${encodeURIComponent(fx.otherParentEmail)}`)).status).toBe(403);

    const bases = await parent.get("/api/schools/knowledge-bases");
    expect(bases.status).toBe(200);
    expect(Array.isArray(bases.body)).toBe(true);
  });

  it("scopes a school admin to the school they administer, not a stale school id", async () => {
    const admin = asUser(fx.schoolAdminEmail);
    const list = await admin.get("/api/schools");
    expect(list.status).toBe(200);
    const ids = list.body.map((school: { id: number }) => school.id);
    expect(ids).toContain(fx.schoolId);
    expect(ids).not.toContain(fx.otherSchoolId);

    const school = await admin.get(`/api/schools/${fx.schoolId}`);
    expect(school.status).toBe(200);
    expect(school.body.registrationCode).toBe(fx.registrationCode);

    const students = await admin.get(`/api/schools/${fx.schoolId}/students`);
    expect(students.status).toBe(200);
    expect(students.body.some((row: { id: number }) => row.id === fx.childId)).toBe(true);
    expect((await admin.get(`/api/schools/${fx.otherSchoolId}/students`)).status).toBe(403);

    const here = await admin.get(`/api/school-admin/students/by-location/${fx.locationId}`);
    expect(here.status).toBe(200);
    expect((await admin.get(`/api/school-admin/students/by-location/${fx.otherLocationId}`)).status).toBe(403);

    expect((await admin.get("/api/school-admin/debug-users")).status).toBe(403);
    expect((await admin.get(`/api/users/role/${encodeURIComponent(fx.parentEmail)}`)).status).toBe(200);
    expect((await admin.get(`/api/users/role/${encodeURIComponent(fx.otherAdminEmail)}`)).status).toBe(403);
  });

  it("lets a super admin use destructive and directory routes without losing that role", async () => {
    const admin = asUser(fx.superAdminEmail);
    const schools = await admin.get("/api/schools");
    expect(schools.status).toBe(200);
    const ids = schools.body.map((school: { id: number }) => school.id);
    expect(ids).toEqual(expect.arrayContaining([fx.schoolId, fx.otherSchoolId]));

    expect((await admin.get("/api/school-admin/debug-users")).status).toBe(200);
    expect(Array.isArray((await admin.get("/api/school-admin/debug-users")).body)).toBe(true);
    expect((await admin.get("/api/migration/status")).status).toBe(200);
    expect((await admin.get("/api/admin/backups")).status).toBe(200);
    expect((await admin.get("/api/admin/role-invitations")).status).toBe(200);
    expect((await admin.get("/api/school-applications")).status).toBe(200);
    expect(
      (await admin.get(`/api/admin-users/users/email/${encodeURIComponent(fx.parentEmail)}`)).status,
    ).toBe(200);
    expect((await admin.post("/api/payment-import/upload-payments")).status).toBe(400);

    const created = await admin.post("/api/schools").send({
      name: "Locked Down School",
      type: "school",
      city: "Rochester",
      state: "NY",
      zipCode: "14604",
      email: `locked-${fx.superAdminId}@example.com`,
    });
    expect(created.status).toBe(201);
    const fresh = await storage.getUser(fx.superAdminId);
    expect(fresh?.role).toBe("superAdmin");
  });

  it("binds educator class lookup to the signed-in educator", async () => {
    const educator = asUser(fx.educatorEmail);
    const own = await educator.get(`/api/educator/classes?email=${encodeURIComponent(fx.educatorEmail)}`);
    expect(own.status).toBe(200);
    expect(Array.isArray(own.body)).toBe(true);

    const other = await educator.get(
      `/api/educator/classes?email=${encodeURIComponent(fx.schoolAdminEmail)}`,
    );
    expect(other.status).toBe(403);
    expect((await asUser().get("/api/educator/classes")).status).toBe(401);
  });
});
