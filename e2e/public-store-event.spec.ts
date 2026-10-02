import { test, expect, type APIRequestContext } from "@playwright/test";
import { loginSchoolAdmin } from "./helpers/schoolAdminAuth";
import { postEnsurePublicStoreSchema, postSetupPublicStoreScenario, testApiToken } from "./helpers/testSeed";
import { requireLinkedSeed } from "./helpers/requireLinkedSeed";
import { postFulfillStoreCheckout } from "./helpers/publicStoreCheckout";
import { isRealStripeTestSecretConfigured } from "./helpers/stripeEnv";
import {
  emptyStoreEventRsvp,
  eventStripeLineItems,
  type StoreEventRsvp,
  type StoreEventRsvpSnapshot,
} from "../shared/store-event-rsvp";

test.describe.configure({ mode: "serial" });

type Seed = {
  storeSlug: string;
  admin: { email: string; password: string };
};

let seed: Seed;
let adminHeaders: Record<string, string>;

test.describe("public store event RSVP", () => {
  test.describe.configure({ timeout: 180_000 });

  test.beforeAll(async ({ request, browser }) => {
    test.setTimeout(120_000);
    const ensured = await postEnsurePublicStoreSchema(request);
    if (!ensured.response.ok()) {
      throw new Error(`public store schema ensure failed (${ensured.response.status()}): ${ensured.json?.error ?? "unknown"}`);
    }

    const setup = await postSetupPublicStoreScenario(request, { linkSupabaseAuthAdmin: true });
    const linked = requireLinkedSeed(setup.response, setup.json, {
      linked: setup.json?.data?.adminSupabaseLinked === true,
      need: "School admin Supabase",
    });
    seed = { storeSlug: linked.storeSlug, admin: linked.admin };

    const page = await browser.newPage();
    await loginSchoolAdmin(page, seed.admin.email, seed.admin.password);
    const token = await page.evaluate(() => localStorage.getItem("supabase_token"));
    await page.close();
    if (!token) throw new Error("School admin session did not store a Supabase token");
    adminHeaders = {
      Authorization: `Bearer ${token}`,
      "X-Active-Role": "schoolAdmin",
      "Content-Type": "application/json",
    };
  });

  test("admin publishes an event and a guest RSVP pays for adults only", async ({ page, request }) => {
    const eventName = `Harvest Supper ${Date.now()}`;
    const guestEmail = `harvest-${Date.now()}@example.com`;

    await loginSchoolAdmin(page, seed.admin.email, seed.admin.password);
    await page.evaluate(() => localStorage.setItem("activeRole", "schoolAdmin"));
    await page.goto("/school-admin/public-store?tab=products", { waitUntil: "domcontentloaded" });
    await page.getByTestId("select-product-kind").click();
    await page.getByRole("option", { name: "Event" }).click();
    await page.getByTestId("input-event-name").fill(eventName);
    await page.getByTestId("input-event-description").fill("Campus supper");
    await page.getByTestId("input-event-date").fill("2026-11-15");
    await page.getByTestId("input-event-location").fill("Brighton campus");
    await page.getByTestId("switch-attendee-children").click();
    await page.getByTestId("switch-meal-gluten_free").click();
    await page.getByTestId("switch-meal-other").click();
    await page.getByTestId("button-create-event").click();
    await expect(page.getByText(eventName)).toBeVisible({ timeout: 20_000 });

    await page.goto(`/store/${seed.storeSlug}`, { waitUntil: "domcontentloaded" });
    await expect(page.getByText("From $25.00").first()).toBeVisible();
    await page.getByRole("link", { name: "View event" }).first().click();
    await expect(page.getByTestId("store-event-when")).toContainText("2026-11-15");
    await expect(page.getByTestId("store-event-when")).toContainText("Brighton campus");
    await expect(page.getByTestId("input-attendee-guests")).toHaveCount(0);
    await expect(page.getByTestId("input-meal-vegan")).toHaveCount(0);

    await page.getByTestId("input-attendee-adult").fill("2");
    await page.getByTestId("input-attendee-children").fill("1");
    await page.getByTestId("input-meal-gluten_free").fill("3");
    await page.getByTestId("input-meal-other").fill("1");
    await page.getByTestId("input-event-other-note").fill("sesame");
    await expect(page.getByTestId("store-event-total")).toHaveText("$50.00");
    await page.getByTestId(/^store-add-event-/).click();

    const snapshotResponse = page.waitForResponse(
      (r) => r.url().includes("/snapshot") && r.request().method() === "POST",
    );
    await page.getByTestId("store-cart-button").click();
    const snapshot = await snapshotResponse;
    expect(snapshot.ok()).toBeTruthy();
    const snapshotBody = (await snapshot.json()) as {
      amountDueCents: number;
      lines: Array<{
        title: string;
        lineTotalCents: number;
        eventRsvp?: {
          attendees: Array<{ type: string; quantity: number; unitPriceCents: number; lineTotalCents: number }>;
          meals: Array<{ type: string; quantity: number }>;
          otherNote: string | null;
          location: string;
        };
      }>;
    };
    const line = snapshotBody.lines.find((row) => row.eventRsvp);
    expect(line?.eventRsvp).toBeTruthy();
    expect(snapshotBody.amountDueCents).toBe(5000);
    expect(line!.lineTotalCents).toBe(5000);
    expect(line!.eventRsvp!.location).toBe("Brighton campus");
    expect(line!.eventRsvp!.otherNote).toBe("sesame");
    expect(line!.eventRsvp!.attendees).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "adult", quantity: 2, unitPriceCents: 2500, lineTotalCents: 5000 }),
        expect.objectContaining({ type: "children", quantity: 1, unitPriceCents: 0, lineTotalCents: 0 }),
      ]),
    );
    expect(line!.eventRsvp!.attendees.some((row) => row.type === "guests")).toBe(false);
    expect(line!.eventRsvp!.meals.map((meal) => meal.type).sort()).toEqual(["gluten_free", "other"]);
    expect(eventStripeLineItems(line!.eventRsvp as StoreEventRsvpSnapshot, line!.title)).toEqual([
      { name: `${line!.title} — Adult`, unitAmountCents: 2500, quantity: 2 },
    ]);

    await expect(page.getByTestId("store-cart-event-summary")).toContainText("2 adult");
    await page.getByTestId("store-checkout-step1-continue").click();
    await page.getByTestId("store-checkout-parent-first-name").fill("Ada");
    await page.getByTestId("store-checkout-parent-last-name").fill("Parent");
    await page.getByTestId("store-checkout-parent-email").fill(guestEmail);
    await page.getByTestId("store-checkout-parent-phone").fill("5555550100");
    await page.getByTestId("store-checkout-step2-continue").click();
    await expect(page.getByTestId("store-delivery-pickup-only")).toBeVisible();
    await expect(page.getByTestId("store-delivery-shipping")).toHaveCount(0);
    await page.getByTestId("store-checkout-delivery-continue").click();
    await expect(page.getByText("$50.00").last()).toBeVisible();

    let checkoutBody: { accessToken?: string; checkoutUrl?: string; message?: string } | null = null;
    await page.route(/checkout\.stripe\.com/, (route) => route.abort());
    await page.route("**/api/public/store/**/checkout", async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue();
        return;
      }
      const response = await route.fetch();
      const text = await response.text();
      checkoutBody = JSON.parse(text) as { accessToken?: string; checkoutUrl?: string; message?: string };
      await route.fulfill({
        status: response.status(),
        headers: response.headers(),
        body: text,
      });
    });
    await page.getByTestId("store-checkout-submit").click({ noWaitAfter: true });
    await expect.poll(() => checkoutBody, { timeout: 20_000 }).not.toBeNull();
    expect(checkoutBody!.accessToken, JSON.stringify(checkoutBody)).toBeTruthy();
    if (isRealStripeTestSecretConfigured()) {
      expect(checkoutBody!.checkoutUrl, JSON.stringify(checkoutBody)).toBeTruthy();
    }

    const fulfilled = await postFulfillStoreCheckout(request, { accessToken: checkoutBody!.accessToken });
    expect(fulfilled.ok, JSON.stringify(fulfilled.json)).toBeTruthy();

    const preview = await confirmationPreview(request, guestEmail);
    expect(preview).toContain(eventName);
    expect(preview).toContain("2026-11-15");
    expect(preview).toContain("Brighton campus");
    expect(preview).toContain("Adult x2");
    expect(preview).toContain("Children x1");
    expect(preview).toContain("Gluten-free x3");
    expect(preview).toContain("sesame");

    await page.goto("/school-admin/public-store?tab=purchases", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("store-event-totals")).toContainText("2 adults", { timeout: 20_000 });
    await expect(page.getByTestId("store-event-totals")).toContainText("1 children");
    await expect(page.getByTestId("store-event-totals")).toContainText("3 gluten-free");

    const shop = await request.get("/api/supply-lists/shop-products", { headers: adminHeaders });
    expect(shop.ok()).toBeTruthy();
    const shopJson = (await shop.json()) as { products: Array<{ name: string }> };
    expect(shopJson.products.some((product) => product.name === eventName)).toBe(false);
  });

  test("rejects an RSVP after the close date", async ({ request }) => {
    const closed = emptyStoreEventRsvp("2026-01-01");
    closed.location = "Hall";
    closed.closeOn = "2026-01-02";
    const product = await createPublishedEvent(request, "Closed supper", closed);
    const body = await postSnapshot(request, product, {
      attendees: [{ type: "adult", quantity: 1 }],
      meals: [],
      otherNote: null,
    });
    expect(body.lines[0]?.unavailableReason).toMatch(/closed/i);
  });

  test("rejects another adult after the paid cap is full", async ({ request }) => {
    const capped = emptyStoreEventRsvp("2026-12-01");
    capped.location = "Hall";
    capped.closeOn = null;
    capped.attendees = capped.attendees.map((row) =>
      row.type === "adult" ? { ...row, enabled: true, priceCents: 2500, capacity: 1 } : row,
    );
    const product = await createPublishedEvent(request, "Capped supper", capped);
    const answer = {
      attendees: [{ type: "adult", quantity: 1 }],
      meals: [],
      otherNote: null,
    };
    const paid = await postCheckout(request, product, `cap-${Date.now()}@example.com`, answer);
    const paidBody = await readJson<{ accessToken?: string; checkoutUrl?: string | null }>(paid);
    expect(paidBody.accessToken, JSON.stringify(paidBody)).toBeTruthy();
    if (isRealStripeTestSecretConfigured()) {
      expect(paidBody.checkoutUrl).toBeTruthy();
    }
    const done = await postFulfillStoreCheckout(request, { accessToken: paidBody.accessToken });
    expect(done.ok, JSON.stringify(done.json)).toBeTruthy();

    const over = await postSnapshot(request, product, answer);
    expect(over.lines[0]?.unavailableReason).toMatch(/full/i);
  });

  test("records a children-only RSVP at $0 without Stripe and still emails", async ({ request }) => {
    const freeEmail = `free-${Date.now()}@example.com`;
    const freeConfig = emptyStoreEventRsvp("2026-12-02");
    freeConfig.location = "Hall";
    freeConfig.closeOn = null;
    freeConfig.attendees = freeConfig.attendees.map((row) =>
      row.type === "children" ? { ...row, enabled: true, priceCents: 0 } : { ...row, enabled: false, priceCents: 0 },
    );
    const product = await createPublishedEvent(request, "Free children supper", freeConfig);
    const answer = {
      attendees: [{ type: "children", quantity: 2 }],
      meals: [],
      otherNote: null,
    };
    const snapshot = await postSnapshot(request, product, answer);
    expect(snapshot.amountDueCents).toBe(0);
    expect(snapshot.lines[0]?.unavailableReason).toBeFalsy();
    expect(eventStripeLineItems(snapshot.lines[0]!.eventRsvp as StoreEventRsvpSnapshot, snapshot.lines[0]!.title)).toEqual([]);

    const checkout = await postCheckout(request, product, freeEmail, answer);
    const body = await readJson<{ checkoutUrl?: string | null }>(checkout);
    expect(body.checkoutUrl ?? null).toBeNull();
    const preview = await confirmationPreview(request, freeEmail);
    expect(preview).toContain("Free children supper");
    expect(preview).toContain("Children x2");
  });

  test("rejects a card total between 1 and 49 cents", async ({ request }) => {
    const tiny = emptyStoreEventRsvp("2026-12-03");
    tiny.location = "Hall";
    tiny.closeOn = null;
    tiny.attendees = tiny.attendees.map((row) =>
      row.type === "adult" ? { ...row, enabled: true, priceCents: 25, capacity: null } : { ...row, enabled: false },
    );
    const product = await createPublishedEvent(request, "Quarter supper", tiny);
    const checkout = await postCheckout(request, product, `tiny-${Date.now()}@example.com`, {
      attendees: [{ type: "adult", quantity: 1 }],
      meals: [],
      otherNote: null,
    });
    const body = await readJson<{ code?: string }>(checkout, 400);
    expect(body.code).toBe("STRIPE_MINIMUM");
  });

  test("requires a note when other meals are counted", async ({ request }) => {
    const config = emptyStoreEventRsvp("2026-12-04");
    config.location = "Hall";
    config.closeOn = null;
    config.meals = config.meals.map((row) => (row.type === "other" ? { ...row, enabled: true } : row));
    const product = await createPublishedEvent(request, "Allergy supper", config);
    const body = await postSnapshot(request, product, {
      attendees: [{ type: "adult", quantity: 1 }],
      meals: [{ type: "other", quantity: 1 }],
      otherNote: "  ",
    });
    expect(body.lines[0]?.unavailableReason).toMatch(/other allergy/i);
  });
});

type RsvpAnswer = {
  attendees: Array<{ type: "adult" | "children" | "guests"; quantity: number }>;
  meals: Array<{ type: "gluten_free" | "vegan" | "dairy_free" | "other"; quantity: number }>;
  otherNote: string | null;
};

type SnapshotBody = {
  amountDueCents: number;
  lines: Array<{
    title: string;
    unavailableReason?: string;
    eventRsvp?: {
      attendees: Array<{ type: string; quantity: number; unitPriceCents: number; lineTotalCents: number }>;
      meals: Array<{ type: string; quantity: number }>;
      otherNote: string | null;
    };
  }>;
};

async function postSnapshot(request: APIRequestContext, product: { id: number; listingId: number }, answer: RsvpAnswer) {
  const response = await request.post(`/api/public/store/${seed.storeSlug}/snapshot`, {
    data: {
      cart: [
        {
          lineId: `line-${product.id}`,
          listingId: product.listingId,
          listingType: "product",
          sourceId: product.id,
          quantity: 1,
          eventRsvp: answer,
        },
      ],
    },
  });
  return readJson<SnapshotBody>(response);
}

async function postCheckout(
  request: APIRequestContext,
  product: { id: number; listingId: number },
  email: string,
  answer: RsvpAnswer,
) {
  return request.post(`/api/public/store/${seed.storeSlug}/checkout`, {
    data: {
      cart: [
        {
          lineId: `line-${product.id}`,
          listingId: product.listingId,
          listingType: "product",
          sourceId: product.id,
          eventRsvp: answer,
        },
      ],
      parent: { firstName: "Ada", lastName: "Parent", email, phone: "5555550100" },
      childAssignments: [],
      productDelivery: { method: "pickup" },
    },
  });
}

async function readJson<T>(response: Awaited<ReturnType<APIRequestContext["post"]>>, status = 200): Promise<T> {
  const text = await response.text();
  expect(response.status(), text).toBe(status);
  return JSON.parse(text) as T;
}

async function confirmationPreview(request: APIRequestContext, email: string): Promise<string> {
  const log = await request.get(
    `/api/test/email-log?recipient=${encodeURIComponent(email)}&type=store_purchase_confirmation`,
    { headers: { "X-Test-Token": testApiToken() } },
  );
  const json = await readJson<{ data: Array<{ preview?: string }> }>(log);
  return json.data.find((row) => row.preview)?.preview ?? "";
}

async function createPublishedEvent(
  request: APIRequestContext,
  name: string,
  rsvp: StoreEventRsvp,
): Promise<{ id: number; listingId: number }> {
  const created = await request.post("/api/school-admin/public-store/products", {
    headers: adminHeaders,
    data: { name, description: name, priceCents: 0, productKind: "event", rsvp },
  });
  expect(created.ok(), await created.text()).toBeTruthy();
  const product = (await created.json()) as { id: number };
  const listing = await request.post("/api/school-admin/public-store/listings", {
    headers: adminHeaders,
    data: { listingType: "product", sourceId: product.id, isPublished: true, membersOnly: false },
  });
  expect(listing.ok(), await listing.text()).toBeTruthy();
  const listingBody = (await listing.json()) as { id: number };
  return { id: product.id, listingId: listingBody.id };
}
