import express from "express";
import fileUpload from "express-fileupload";
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
    process.env.AMAZON_PAAPI_MOCK = "1";
    await testDb.cleanup();
    seed = await seedSupplyListScenario(testDb);
    app = express();
    app.use(express.json());
    app.use(
      "/api/supply-lists",
      fileUpload({
        limits: { fileSize: 5 * 1024 * 1024 },
        abortOnLimit: true,
      }),
    );
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

  it("imports CSV, creates an affiliate product, and links storeProductId", async () => {
    const csv = [
      "Supply Item,Qty / Notes,Amazon Link (or Search),Additional Notes,Affiliate Link",
      "CSV Water bottle,1,https://www.amazon.com/dp/B08WATER01,Labeled,",
    ].join("\n");

    const res = await request(app)
      .post(`/api/supply-lists/class/${seed.classA.id}/import-csv`)
      .set("x-test-user-email", seed.admin.email)
      .send({ csv, mode: "replace", dryRun: false });

    expect(res.status).toBe(200);
    expect(res.body.createdProducts).toBe(1);
    expect(res.body.reusedProducts).toBe(0);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].name).toBe("CSV Water bottle");
    expect(res.body.items[0].storeProductId).toEqual(expect.any(Number));
    expect(res.body.items[0].storeProductId).not.toBe(seed.affiliateProduct.id);
    expect(res.body.preview[0].amazonStatus).toBe("create");

    const picker = await request(app)
      .get("/api/supply-lists/shop-products")
      .set("x-test-user-email", seed.admin.email);
    const created = picker.body.products.find(
      (p: { id: number }) => p.id === res.body.items[0].storeProductId,
    );
    expect(created).toBeTruthy();
    expect(created.productKind).toBe("affiliate");
    expect(created.affiliateUrl).toContain("B08WATER01");
  });

  it("reuses the same ASIN twice instead of creating duplicate products", async () => {
    const csv = [
      "Supply Item,Qty / Notes,Amazon Link (or Search),Additional Notes,Affiliate Link",
      "Tissues A,1,https://www.amazon.com/dp/B08CSVREU1,,",
      "Tissues B,1,https://www.amazon.com/dp/B08CSVREU1,,",
    ].join("\n");

    const res = await request(app)
      .post(`/api/supply-lists/class/${seed.classA.id}/import-csv`)
      .set("x-test-user-email", seed.admin.email)
      .send({ csv, mode: "replace" });

    expect(res.status).toBe(200);
    expect(res.body.createdProducts).toBe(1);
    expect(res.body.reusedProducts).toBe(0);
    expect(res.body.items).toHaveLength(2);
    expect(res.body.items[0].storeProductId).toBe(res.body.items[1].storeProductId);
    expect(res.body.preview[0].amazonStatus).toBe("create");
    expect(res.body.preview[1].amazonStatus).toBe("reuse");
  });

  it("reuses an existing school affiliate by ASIN", async () => {
    const csv = [
      "Item,Amazon Link",
      "Classroom tissues,https://www.amazon.com/dp/B08SUPPLY1",
    ].join("\n");

    const res = await request(app)
      .post(`/api/supply-lists/class/${seed.classA.id}/import-csv`)
      .set("x-test-user-email", seed.admin.email)
      .send({ csv, mode: "replace" });

    expect(res.status).toBe(200);
    expect(res.body.createdProducts).toBe(0);
    expect(res.body.reusedProducts).toBe(1);
    expect(res.body.items[0].storeProductId).toBe(seed.affiliateProduct.id);
    expect(res.body.preview[0].amazonStatus).toBe("reuse");
  });

  it("imports a row with no Amazon URL", async () => {
    const csv = ["Supply Item,Qty / Notes", "Pencils,2 box"].join("\n");
    const res = await request(app)
      .post(`/api/supply-lists/class/${seed.classA.id}/import-csv`)
      .set("x-test-user-email", seed.admin.email)
      .send({ csv, mode: "replace" });

    expect(res.status).toBe(200);
    expect(res.body.items[0].name).toBe("Pencils");
    expect(res.body.items[0].quantity).toBe(2);
    expect(res.body.items[0].unit).toBe("box");
    expect(res.body.items[0].storeProductId).toBeNull();
    expect(res.body.preview[0].amazonStatus).toBe("skip");
  });

  it("dry-run does not persist items or products", async () => {
    const csv = [
      "Supply Item,Amazon Link",
      "CSV Dry run,https://www.amazon.com/dp/B08DRYRUN1",
    ].join("\n");

    const preview = await request(app)
      .post(`/api/supply-lists/class/${seed.classA.id}/import-csv`)
      .set("x-test-user-email", seed.admin.email)
      .send({ csv, mode: "replace", dryRun: true });

    expect(preview.status).toBe(200);
    expect(preview.body.createdProducts).toBe(1);
    expect(preview.body.preview[0].amazonStatus).toBe("create");
    expect(preview.body.preview[0].storeProductId).toBeNull();

    const list = await request(app)
      .get(`/api/supply-lists/class/${seed.classA.id}`)
      .set("x-test-user-email", seed.admin.email);
    expect(list.body.items.some((i: { name: string }) => i.name === "Tissues")).toBe(true);
    expect(list.body.items.some((i: { name: string }) => i.name === "CSV Dry run")).toBe(false);

    const picker = await request(app)
      .get("/api/supply-lists/shop-products")
      .set("x-test-user-email", seed.admin.email);
    expect(
      picker.body.products.some((p: { name: string }) => p.name.includes("B08DRYRUN1")),
    ).toBe(false);
  });

  it("appends CSV rows after existing items", async () => {
    const csv = ["Supply Item,Qty / Notes", "Clipboard,1"].join("\n");
    const res = await request(app)
      .post(`/api/supply-lists/class/${seed.classA.id}/import-csv`)
      .set("x-test-user-email", seed.admin.email)
      .send({ csv, mode: "append" });

    expect(res.status).toBe(200);
    const names = res.body.items.map((i: { name: string }) => i.name);
    expect(names).toEqual(expect.arrayContaining(["Tissues", "Clipboard"]));
  });

  it("accepts a multipart CSV file", async () => {
    const csv = ["Supply Item,Qty / Notes", "Markers,1"].join("\n");
    const res = await request(app)
      .post(`/api/supply-lists/class/${seed.classA.id}/import-csv`)
      .set("x-test-user-email", seed.admin.email)
      .field("mode", "replace")
      .attach("file", Buffer.from(csv), "supplies.csv");

    expect(res.status).toBe(200);
    expect(res.body.items[0].name).toBe("Markers");
  });
});
