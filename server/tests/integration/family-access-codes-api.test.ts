import express from "express";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, expect, it } from "@jest/globals";
import { TestDatabase } from "../helpers/testDatabase";
import { seedFamilyAccessCodeScenario } from "../helpers/seedFamilyAccessCodeScenario";
import familyAccessCodesAdminRouter, { parentAccessCodeRouter } from "../../api/family-access-codes";
import { ensureFamilyAccessCodesSchema } from "../../lib/ensure-family-access-codes-schema";
import { describeIntegration } from "../helpers/integrationDb";
import { storage } from "../../storage";
import { updateParentLocation } from "../../services/locationSyncService";

describeIntegration("Integration: family access codes API", () => {
  let app: express.Application;
  let seed: Awaited<ReturnType<typeof seedFamilyAccessCodeScenario>>;
  const testDb = new TestDatabase();

  beforeAll(async () => {
    await ensureFamilyAccessCodesSchema();
  });

  afterAll(async () => {
    await testDb.cleanup();
  });

  beforeEach(async () => {
    await testDb.cleanup();
    seed = await seedFamilyAccessCodeScenario(testDb);
    app = express();
    app.use(express.json());
    app.use("/api/school-admin", familyAccessCodesAdminRouter);
    app.use("/api/parent", parentAccessCodeRouter);
  });

  it("admin can list and parent sees their code", async () => {
    const list = await request(app)
      .get(`/api/school-admin/access-codes?locationId=${seed.keyedCampus.id}`)
      .set("x-test-user-email", seed.admin.email);
    expect(list.status).toBe(200);
    expect(list.body.codes.some((c: { parentId: number }) => c.parentId === seed.parent.id)).toBe(true);

    const mine = await request(app)
      .get("/api/parent/access-code")
      .set("x-test-user-email", seed.parent.email);
    expect(mine.status).toBe(200);
    expect(mine.body.enabled).toBe(true);
    expect(mine.body.code).toBe(seed.assignedCode);
  });

  it("parent B cannot read parent A's code", async () => {
    const mine = await request(app)
      .get("/api/parent/access-code")
      .set("x-test-user-email", seed.parentB.email);
    expect(mine.status).toBe(200);
    expect(mine.body.enabled).toBe(true);
    expect(mine.body.code).toBeNull();
  });

  it("other school admin cannot list this campus", async () => {
    const res = await request(app)
      .get(`/api/school-admin/access-codes?locationId=${seed.keyedCampus.id}`)
      .set("x-test-user-email", seed.otherSchool.admin.email);
    expect([400, 403, 404]).toContain(res.status);
  });

  it("rejects write when campus flag is off", async () => {
    await storage.updateUser(seed.parent.id, { locationId: seed.otherCampus.id });
    const res = await request(app)
      .put(`/api/school-admin/parents/${seed.parent.id}/access-code`)
      .set("x-test-user-email", seed.admin.email)
      .send({ code: "9999" });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("CAMPUS_DISABLED");
  });

  it("campus transfer revokes the old code", async () => {
    const result = await updateParentLocation(seed.parent.id, seed.otherCampus.id, {
      actorId: seed.admin.id,
      actorEmail: seed.admin.email,
      actorRole: "schoolAdmin",
      schoolId: seed.school.id,
    });
    expect(result.success).toBe(true);

    const mine = await request(app)
      .get("/api/parent/access-code")
      .set("x-test-user-email", seed.parent.email);
    expect(mine.status).toBe(200);
    expect(mine.body.code).toBeNull();
  });

  it("CSV dry-run then commit assigns parent B", async () => {
    const csv = ["Email,Door code", `${seed.parentB.email},7788`].join("\n");
    const dry = await request(app)
      .post("/api/school-admin/access-codes/import")
      .set("x-test-user-email", seed.admin.email)
      .send({ csv, locationId: seed.keyedCampus.id, dryRun: true });
    expect(dry.status).toBe(200);
    expect(dry.body.assigned).toBe(0);
    expect(dry.body.preview.some((r: { status: string }) => r.status === "ok")).toBe(true);

    const commit = await request(app)
      .post("/api/school-admin/access-codes/import")
      .set("x-test-user-email", seed.admin.email)
      .send({ csv, locationId: seed.keyedCampus.id, dryRun: false });
    expect(commit.status).toBe(200);
    expect(commit.body.assigned).toBe(1);

    const mine = await request(app)
      .get("/api/parent/access-code")
      .set("x-test-user-email", seed.parentB.email);
    expect(mine.body.code).toBe("7788");
  });

  it("CSV unknown email is an error", async () => {
    const csv = ["Email,Door code", "nobody@example.com,1234"].join("\n");
    const res = await request(app)
      .post("/api/school-admin/access-codes/import")
      .set("x-test-user-email", seed.admin.email)
      .send({ csv, locationId: seed.keyedCampus.id, dryRun: true });
    expect(res.status).toBe(200);
    expect(res.body.preview[0].status).toBe("error");
  });
});
