import express from "express";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, expect, it } from "@jest/globals";
import { TestDatabase } from "../helpers/testDatabase";
import { seedClassAllergyScenario } from "../helpers/seedClassAllergyScenario";
import { parentClassAllergyAlertsRouter } from "../../api/class-allergy-alerts";
import {
  notifyClassesAfterAllergyChange,
  notifyClassParentsOfNewAllergens,
} from "../../lib/class-allergy-alerts";
import { extractSevereAllergens } from "@shared/class-allergy-alerts";
import { storage } from "../../storage";
import { describeIntegration } from "../helpers/integrationDb";

describeIntegration("Integration: class allergy alerts", () => {
  let app: express.Application;
  let seed: Awaited<ReturnType<typeof seedClassAllergyScenario>>;
  const testDb = new TestDatabase();

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use("/api/parent/class-allergy-alerts", parentClassAllergyAlertsRouter);
  });

  afterAll(async () => {
    await testDb.cleanup();
  });

  beforeEach(async () => {
    await testDb.cleanup();
    seed = await seedClassAllergyScenario(testDb, { notify: false });
  });

  it("parent dashboard payload lists peanut without naming the student", async () => {
    const res = await request(app)
      .get("/api/parent/class-allergy-alerts")
      .set("x-test-user-email", seed.parentB.email);
    expect(res.status).toBe(200);
    expect(res.body.alerts).toHaveLength(1);
    expect(res.body.alerts[0].classId).toBe(seed.class.id);
    expect(res.body.alerts[0].allergens.map((a: { key: string }) => a.key)).toEqual(["peanut"]);
    const blob = JSON.stringify(res.body);
    expect(blob).not.toContain(seed.childA.firstName);
    expect(blob).not.toContain(seed.childA.lastName);
  });

  it("notifies class parents when a peanut allergy is newly present", async () => {
    const result = await notifyClassParentsOfNewAllergens({
      classId: seed.class.id,
      allergens: extractSevereAllergens("Peanuts"),
      schoolId: seed.school.id,
    });
    expect(result.skipped).toBe(false);
    expect(result.notified).toBeGreaterThanOrEqual(2);

    const recipients = await storage.getNotificationRecipientsByUserId(seed.parentB.id);
    const inApp = recipients.filter((r) => r.deliveryType === "in_app");
    expect(inApp.length).toBeGreaterThan(0);
    const notification = await storage.getNotificationById(inApp[0].notificationId);
    expect(notification?.subject).toMatch(/Allergy reminder/i);
    expect(notification?.content).toMatch(/peanut/i);
    expect(notification?.content).not.toContain(seed.childA.firstName);
  });

  it("does not re-notify when a second child already shares the same allergen", async () => {
    await storage.updateChild(seed.childB.id, { allergies: "Peanuts" } as any);
    await notifyClassesAfterAllergyChange({
      childId: seed.childB.id,
      previousAllergies: null,
      nextAllergies: "Peanuts",
    });
    const recipients = await storage.getNotificationRecipientsByUserId(seed.parentA.id);
    expect(recipients).toHaveLength(0);
  });
});
