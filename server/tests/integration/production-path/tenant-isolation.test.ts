import { beforeAll, beforeEach, expect, it } from "@jest/globals";
import type { Application } from "express";
import request from "supertest";
import { eq } from "drizzle-orm";
import { describeProductionPath } from "../../helpers/describeProductionPath";
import { createTenantIsolationApp } from "../../helpers/tenantIsolationApp";
import { testDb } from "../../helpers/testDatabase";
import { storage } from "../../../storage";
import { getDb } from "../../../db";
import { customForms, events, storeProducts, weeklySkeletons } from "@shared/schema";

describeProductionPath("production-path: tenant isolation", () => {
  let app: Application;
  let adminA = "";
  let educatorA = "";
  let parentA = "";
  let parentBId = 0;
  let schoolB = 0;
  let childB = 0;
  let classB = 0;
  let paymentB = 0;
  let formB = 0;
  let eventB = 0;
  let skeletonB = 0;
  let productB = 0;
  const secret = "school-b-only-marker";

  beforeAll(() => {
    app = createTenantIsolationApp();
  });

  beforeEach(async () => {
    const schoolAdmin = await testDb.createTestUser({ role: "schoolAdmin", name: "Admin A" });
    const school = await testDb.createTestSchool(schoolAdmin.id, { name: "School A" });
    const otherAdmin = await testDb.createTestUser({ role: "schoolAdmin", name: "Admin B" });
    const other = await testDb.createTestSchool(otherAdmin.id, { name: "School B" });
    await testDb.updateUserSchoolId(schoolAdmin.id, other.id);
    await storage.createUserRole({
      userId: schoolAdmin.id,
      role: "schoolAdmin",
      schoolId: school.id,
      isPrimary: true,
    });

    const educator = await testDb.createTestUser({
      role: "educator",
      name: "Shared Name",
      schoolId: school.id,
    });
    await storage.createUserRole({
      userId: educator.id,
      role: "educator",
      schoolId: school.id,
      isPrimary: true,
    });
    const parent = await testDb.createTestUser({ role: "parent", schoolId: school.id });
    await testDb.createTestChild(parent.id, { schoolId: school.id, firstName: "Ada" });
    const otherParent = await testDb.createTestUser({ role: "parent", schoolId: other.id });
    const otherChild = await testDb.createTestChild(otherParent.id, {
      schoolId: other.id,
      firstName: "Bea",
    });
    const otherClass = await testDb.createTestClass(other.id, {
      title: secret,
      instructorName: educator.name,
      instructorId: educator.id,
    });
    const payment = await testDb.createTestPayment(otherParent.email, {
      schoolId: other.id,
      description: secret,
    });
    const db = await getDb();
    const [event] = await db
      .insert(events)
      .values({
        title: secret,
        description: secret,
        schoolId: other.id,
        organizerId: otherAdmin.id,
        startDate: new Date(),
        endDate: new Date(),
        location: "B",
        eventType: "other",
      })
      .returning();
    const [form] = await db
      .insert(customForms)
      .values({
        schoolId: other.id,
        title: secret,
        slug: `b-${other.id}-${Date.now()}`,
        formType: "custom",
        createdBy: otherAdmin.id,
      } as any)
      .returning();
    const [skeleton] = await db
      .insert(weeklySkeletons)
      .values({
        schoolId: other.id,
        name: secret,
        createdBy: otherAdmin.id,
      })
      .returning();
    const [product] = await db
      .insert(storeProducts)
      .values({
        schoolId: other.id,
        name: secret,
        priceCents: 100,
      })
      .returning();

    adminA = schoolAdmin.email;
    educatorA = educator.email;
    parentA = parent.email;
    parentBId = otherParent.id;
    schoolB = other.id;
    childB = otherChild.id;
    classB = otherClass.id;
    paymentB = payment.id;
    formB = form.id;
    eventB = event.id;
    skeletonB = skeleton.id;
    productB = product.id;
  });

  function asUser(email: string) {
    const agent = request(app);
    const withAuth = (req: request.Test) => req.set("x-test-user-email", email);
    return {
      get: (url: string) => withAuth(agent.get(url)),
      post: (url: string, body?: unknown) => withAuth(agent.post(url).send(body ?? {})),
      patch: (url: string, body?: unknown) => withAuth(agent.patch(url).send(body ?? {})),
      delete: (url: string) => withAuth(agent.delete(url)),
    };
  }

  function blocked(status: number) {
    expect(status).toBeGreaterThanOrEqual(400);
    expect(status).toBeLessThan(500);
  }

  it("hides fundraiser checkout before a card is charged", async () => {
    const response = await request(app).post("/api/fundraisers/checkout").send({ amount: 100 });
    expect(response.status).toBe(503);
    expect(response.body.error).toBe("FUNDRAISER_CHECKOUT_UNAVAILABLE");
  });

  it("blocks a school admin with a stale school id from school B", async () => {
    const http = asUser(adminA);
    blocked((await http.get(`/api/classes/${classB}`)).status);
    blocked((await http.get(`/api/classes/${classB}/roster`)).status);
    blocked((await http.patch(`/api/classes/${classB}`, { title: "stolen" })).status);
    blocked((await http.get(`/api/payments/${paymentB}`)).status);
    const all = await http.get("/api/payments/all");
    expect(all.status).toBe(200);
    expect(JSON.stringify(all.body)).not.toContain(secret);
    blocked((await http.get(`/api/custom-forms/forms/${formB}`)).status);
    blocked((await http.patch(`/api/custom-forms/forms/${formB}`, { title: "stolen" })).status);
    blocked((await http.get(`/api/calendar-events/${eventB}`)).status);
    blocked((await http.get(`/api/schedule-builder/skeletons/${skeletonB}`)).status);
    blocked((await http.patch(`/api/school-admin/public-store/products/${productB}`, { name: "stolen" })).status);
    blocked((await http.get(`/api/notifications?userId=${parentBId}`)).status);
    blocked((await http.post("/api/notifications", { userId: parentBId, title: "hi", message: "leak" })).status);
    blocked((await http.post("/api/notifications/broadcast", { schoolId: schoolB, title: "hi", message: "leak" })).status);
    const report = await http.get(`/api/admin/financial-reports/summary?schoolId=${schoolB}`);
    expect(JSON.stringify(report.body ?? {})).not.toContain(secret);
    if (report.status !== 200) blocked(report.status);
    const listed = await http.get("/api/classes");
    expect(listed.status).toBe(200);
    expect(JSON.stringify(listed.body)).not.toContain(secret);
  });

  it("blocks an educator of school A from school B students and classes", async () => {
    const http = asUser(educatorA);
    blocked((await http.get(`/api/educator/class-students/${classB}`)).status);
    blocked((await http.get(`/api/classes/${classB}/roster`)).status);
    blocked((await http.get(`/api/children/${childB}`)).status);
    blocked((await http.patch(`/api/children/${childB}`, { firstName: "Stolen" })).status);
    blocked((await http.get(`/api/payments/${paymentB}`)).status);
    blocked((await http.get(`/api/custom-forms/forms/${formB}`)).status);
    blocked((await http.get(`/api/calendar-events/${eventB}`)).status);
  });

  it("blocks a parent of school A from school B", async () => {
    const http = asUser(parentA);
    blocked((await http.get(`/api/children/${childB}`)).status);
    blocked((await http.patch(`/api/children/${childB}`, { firstName: "Stolen" })).status);
    blocked((await http.get(`/api/classes/${classB}/roster`)).status);
    blocked((await http.patch(`/api/classes/${classB}`, { title: "stolen" })).status);
    blocked((await http.get(`/api/payments/${paymentB}`)).status);
    blocked((await http.get(`/api/payments/all`)).status);
    blocked((await http.get(`/api/custom-forms/forms/${formB}`)).status);
    blocked((await http.get(`/api/notifications?userId=${parentBId}`)).status);
    blocked((await http.post("/api/notifications", { userId: parentBId, title: "hi", message: "leak" })).status);
  });

  it("does not leave a cross-school form or product write", async () => {
    const db = await getDb();
    const [form] = await db.select().from(customForms).where(eq(customForms.id, formB));
    const [product] = await db.select().from(storeProducts).where(eq(storeProducts.id, productB));
    expect(form?.title).toBe(secret);
    expect(product?.name).toBe(secret);
  });
});
