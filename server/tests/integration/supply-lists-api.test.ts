import express from "express";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, expect, it } from "@jest/globals";
import { TestDatabase } from "../helpers/testDatabase";
import { seedSupplyListScenario } from "../helpers/seedSupplyListScenario";
import supplyListsRouter, { parentSupplyListRouter } from "../../api/supply-lists";
import { ensureSupplyListsSchema } from "../../lib/ensure-supply-lists-schema";
import { ensurePublicStoreSchema } from "../../lib/ensure-public-store-schema";
import { describeIntegration } from "../helpers/integrationDb";

describeIntegration("Integration: supply lists API", () => {
  let app: express.Application;
  let seed: Awaited<ReturnType<typeof seedSupplyListScenario>>;
  const testDb = new TestDatabase();

  beforeAll(async () => {
    await ensurePublicStoreSchema();
    await ensureSupplyListsSchema();
  });

  afterAll(async () => {
    await testDb.cleanup();
  });

  beforeEach(async () => {
    await testDb.cleanup();
    seed = await seedSupplyListScenario(testDb);
    app = express();
    app.use(express.json());
    app.use("/api/supply-lists", supplyListsRouter);
    app.use("/api/parent/supply-list", parentSupplyListRouter);
  });

  it("admin can list and replace class items in-school", async () => {
    const res = await request(app)
      .get(`/api/supply-lists/class/${seed.classA.id}`)
      .set("x-test-user-email", seed.admin.email);
    expect(res.status).toBe(200);
    expect(res.body.items.some((i: { name: string }) => i.name === "Tissues")).toBe(true);

    const put = await request(app)
      .put(`/api/supply-lists/class/${seed.classA.id}`)
      .set("x-test-user-email", seed.admin.email)
      .send({
        items: [
          {
            name: "Pencils",
            quantity: 3,
            scope: "student",
            required: true,
            storeProductId: seed.affiliateProduct.id,
          },
        ],
      });
    expect(put.status).toBe(200);
    expect(put.body.items).toHaveLength(1);
    expect(put.body.items[0].name).toBe("Pencils");
    expect(put.body.items[0].storeProductId).toBe(seed.affiliateProduct.id);
  });

  it("rejects copy from another school owner", async () => {
    const other = await seedSupplyListScenario(testDb);
    const res = await request(app)
      .post(`/api/supply-lists/class/${seed.classA.id}/copy`)
      .set("x-test-user-email", seed.admin.email)
      .send({ fromOwnerType: "class", fromOwnerId: other.classA.id });
    expect(res.status).toBe(403);
  });

  it("parent household list merges children and never marks affiliate as cart-purchasable", async () => {
    const res = await request(app)
      .get("/api/parent/supply-list")
      .set("x-test-user-email", seed.parent.email);
    expect(res.status).toBe(200);
    const names = res.body.items.map((i: { name: string }) => i.name);
    expect(names).toEqual(expect.arrayContaining(["Water bottle", "Tissues", "Glue sticks"]));
    const water = res.body.items.find((i: { name: string }) => i.name === "Water bottle");
    expect(water.quantity).toBe(2);
    const tissues = res.body.items.find((i: { name: string }) => i.name === "Tissues");
    expect(tissues.product.productKind).toBe("affiliate");
    expect(tissues.product.purchasableInCart).toBe(false);
    expect(tissues.product.affiliateUrl).toContain("amazon.com");
  });

  it("parent cannot check items that are not on their list", async () => {
    const res = await request(app)
      .patch("/api/parent/supply-list/checks")
      .set("x-test-user-email", seed.parent.email)
      .send({ supplyItemIds: [999999], checked: true });
    expect(res.status).toBe(403);
  });

  it("shop products picker includes the affiliate", async () => {
    const res = await request(app)
      .get("/api/supply-lists/shop-products")
      .set("x-test-user-email", seed.admin.email);
    expect(res.status).toBe(200);
    const affiliate = res.body.products.find((p: { id: number }) => p.id === seed.affiliateProduct.id);
    expect(affiliate.productKind).toBe("affiliate");
    expect(affiliate.affiliateUrl).toBeTruthy();
  });

  it("parent household list includes classId-only enrollments", async () => {
    const parent = await testDb.createTestUser({
      role: "parent",
      schoolId: seed.school.id,
    });
    const child = await testDb.createTestChild(parent.id, { schoolId: seed.school.id });
    await testDb.createTestEnrollment(seed.classA.id, child.id, {
      marketplaceClassId: null,
      classId: seed.classA.id,
      status: "enrolled",
      parentId: parent.id,
      parentEmail: parent.email,
      schoolId: seed.school.id,
      className: seed.classA.title,
      childName: `${child.firstName} ${child.lastName}`,
      classType: "marketplace",
    });

    const res = await request(app)
      .get("/api/parent/supply-list")
      .set("x-test-user-email", parent.email);
    expect(res.status).toBe(200);
    const names = res.body.items.map((i: { name: string }) => i.name);
    expect(names).toContain("Tissues");
  });
});
