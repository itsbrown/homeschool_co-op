import express from "express";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { eq, isNull } from "drizzle-orm";
import { sendConciergeLeadEmail } from "../../lib/email-service";
import conciergeChatRouter from "../../api/concierge-chat";
import { getDb } from "../../db";
import { children, conciergeEvents, schools, storeOrderItems, storeOrders, storeProducts, users } from "@shared/schema";
import { emptyStoreEventRsvp, STORE_ATTENDEE_TYPES } from "@shared/store-event-rsvp";
import { seedConciergeLocal, type ConciergeLocalSeed } from "../../../scripts/lib/concierge-local-seed";
import { executeConciergeTool } from "../../services/concierge/tools";
import { getMyFamily, getWeekMaterials } from "../../services/concierge/family";
import { rsvpEvent } from "../../services/concierge/rsvp";
import { startEnrollmentInquiry } from "../../services/concierge/inquiry";
import { buildStaffTestApp } from "../helpers/staffTestApp";
import { describeIntegration } from "../helpers/integrationDb";

jest.mock("../../lib/email-service", () => ({
  sendConciergeLeadEmail: jest.fn(),
}));

const mockLead = sendConciergeLeadEmail as jest.MockedFunction<typeof sendConciergeLeadEmail>;

function names(family: { children?: Array<{ firstName: string }> } | { ok: false }): string[] {
  if (!("children" in family) || !family.children) return [];
  return family.children.map((child) => child.firstName);
}

describeIntegration("concierge phase 1 on local postgres", () => {
  let seeded: ConciergeLocalSeed;
  let app: express.Application;

  beforeAll(async () => {
    delete process.env.PREVIEW_DEMO_MODE;
    process.env.CONCIERGE_AI_MOCK = "1";
    process.env.CONCIERGE_LEAD_EMAIL = "corey@example.invalid";
    process.env.SENDGRID_API_KEY = "test-not-a-real-key";
    seeded = await seedConciergeLocal();
    app = buildStaffTestApp([{ path: "/api/concierge", router: conciergeChatRouter }]);
  }, 60000);

  beforeEach(() => {
    delete process.env.PREVIEW_DEMO_MODE;
    mockLead.mockReset();
    mockLead.mockResolvedValue(true);
    process.env.CONCIERGE_AI_MOCK = "1";
    process.env.CONCIERGE_LEAD_EMAIL = "corey@example.invalid";
    process.env.SENDGRID_API_KEY = "test-not-a-real-key";
  });

  afterAll(() => {
    delete process.env.CONCIERGE_AI_MOCK;
  });

  it("returns only the signed-in parent's children, including a guardian link", async () => {
    const foreign = await getMyFamily(seeded.parents.avery.id, seeded.children.skyler.id);
    expect(foreign).toEqual({ ok: false, error: "That child is not in your family." });
    expect(JSON.stringify(foreign)).not.toContain("Skyler");
    expect(JSON.stringify(foreign)).not.toContain("Quinn");

    const db = await getDb();
    const [otherSchool] = await db.insert(schools).values({
      name: "Harbor Campus Co-op",
      type: "co-op",
      adminId: seeded.parents.avery.id,
      city: "Elsewhere",
      state: "NY",
      zipCode: "00000",
      email: `harbor-${Date.now()}@example.invalid`,
      status: "active",
      registrationCode: `CONCIERGE-HARBOR-${Date.now()}`,
    }).returning({ id: schools.id });
    const [harbor] = await db.insert(children).values({
      parentId: seeded.parents.avery.id,
      parentEmail: seeded.parents.avery.email,
      firstName: "Harbor",
      lastName: "Student",
      birthdate: "2015-06-01",
      gradeLevel: "grades_1_3",
      schoolId: otherSchool.id,
    }).returning({ id: children.id });
    const [unscoped] = await db.insert(users).values({
      username: `unscoped-${Date.now()}`,
      email: `unscoped-${Date.now()}@example.invalid`,
      password: "masked-no-login",
      role: "parent",
      name: "Unscoped Parent",
      schoolId: null,
    }).returning({ id: users.id });

    const crossSchool = await getMyFamily(seeded.parents.avery.id);
    expect(crossSchool.ok).toBe(true);
    expect(JSON.stringify(crossSchool)).not.toContain("Harbor");
    const harborLookup = await getMyFamily(seeded.parents.avery.id, harbor.id);
    expect(harborLookup).toEqual({ ok: false, error: "That child is not in your family." });
    expect(JSON.stringify(harborLookup)).not.toContain("Harbor");
    const noSchool = await getMyFamily(unscoped.id);
    expect(noSchool).toEqual({ ok: false, error: "This account is not linked to a school." });

    const avery = await getMyFamily(seeded.parents.avery.id);
    expect(avery.ok).toBe(true);
    if (!avery.ok) return;
    expect(names(avery).sort()).toEqual(["Quinn", "Rowan"]);
    expect(JSON.stringify(avery)).not.toContain("Skyler");
    expect(JSON.stringify(avery)).not.toContain("2021-01-01");
    expect(JSON.stringify(avery)).not.toContain("allerg");
    expect(avery.children.find((child) => child.firstName === "Rowan")?.enrollments.some((row) => row.className === "Nature Journaling")).toBe(true);

    const blake = await getMyFamily(seeded.parents.blake.id);
    expect(blake.ok).toBe(true);
    if (!blake.ok) return;
    expect(names(blake).sort()).toEqual(["Reese", "Skyler"]);
    expect(JSON.stringify(blake)).not.toContain("Rowan");

    const casey = await getMyFamily(seeded.parents.casey.id);
    expect(casey.ok).toBe(true);
    if (!casey.ok) return;
    expect(names(casey)).toEqual(["Rowan"]);
    expect(JSON.stringify(casey)).not.toContain("Quinn");
    expect(JSON.stringify(casey)).not.toContain(seeded.parents.avery.email);
  });

  it("ignores a tool argument that names another family's child or parent", async () => {
    const result = await executeConciergeTool(
      "get_my_family",
      { userId: seeded.parents.blake.id, parentId: seeded.parents.blake.id, childId: seeded.children.skyler.id },
      { userId: seeded.parents.avery.id, schoolId: seeded.schoolId },
    );
    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).toContain("not in your family");
    expect(JSON.stringify(result)).not.toContain("Skyler");
    expect(JSON.stringify(result)).not.toContain("Rowan");

    const anonymous = await executeConciergeTool(
      "get_my_family",
      { userId: seeded.parents.blake.id, childId: seeded.children.skyler.id },
      { userId: null, schoolId: null },
    );
    expect(anonymous.ok).toBe(false);
    expect(JSON.stringify(anonymous)).not.toContain("Skyler");
    expect(JSON.stringify(anonymous)).not.toContain("Rowan");
  });

  it("shows published week materials only for the signed-in family's enrolled classes", async () => {
    const foreign = await getWeekMaterials(seeded.parents.avery.id, {
      weekStart: seeded.weekStart,
      childId: seeded.children.skyler.id,
    });
    expect(foreign).toEqual({ ok: false, error: "That child is not in your family." });
    expect(JSON.stringify(foreign)).not.toContain("Color wheel");
    expect(JSON.stringify(foreign)).not.toContain("Skyler");
    expect(JSON.stringify(foreign)).not.toContain("Leaf rubbings");

    const avery = await getWeekMaterials(seeded.parents.avery.id, {
      weekStart: seeded.weekStart,
    });
    expect(avery.ok).toBe(true);
    if (!avery.ok) return;
    const blob = JSON.stringify(avery);
    expect(blob).toContain("Leaf rubbings");
    expect(blob).not.toContain("Color wheel");
    expect(blob).not.toContain("Secret draft lesson");
    expect(blob).not.toContain("Unassigned session");
    expect(blob).not.toContain("Skyler");

    const blake = await getWeekMaterials(seeded.parents.blake.id, { weekStart: seeded.weekStart });
    expect(blake.ok).toBe(true);
    if (!blake.ok) return;
    expect(JSON.stringify(blake)).toContain("Color wheel");
    expect(JSON.stringify(blake)).not.toContain("Leaf rubbings");

    const casey = await getWeekMaterials(seeded.parents.casey.id, { weekStart: seeded.weekStart });
    expect(casey.ok).toBe(true);
    if (!casey.ok) return;
    expect(JSON.stringify(casey)).toContain("Leaf rubbings");
    expect(JSON.stringify(casey)).not.toContain("Quinn");
    expect(JSON.stringify(casey)).not.toContain("Color wheel");
  });

  it("records a free RSVP for the signed-in parent and refuses priced, foreign, and full events", async () => {
    const paid = await rsvpEvent(seeded.parents.avery.id, {
      attendees: [{ type: "children", quantity: 1 }, { type: "adult", quantity: 0 }, { type: "guests", quantity: 0 }],
      meals: [],
      otherNote: null,
    }, seeded.events.paid.id);
    expect(paid.ok).toBe(false);
    if (!paid.ok) expect(paid.handoff).toBe(true);

    const db = await getDb();
    const paidOrders = await db.select({ id: storeOrders.id }).from(storeOrders).where(eq(storeOrders.parentId, seeded.parents.avery.id));
    expect(paidOrders).toHaveLength(0);

    const saved = await rsvpEvent(seeded.parents.avery.id, {
      attendees: [{ type: "adult", quantity: 2 }, { type: "children", quantity: 0 }, { type: "guests", quantity: 0 }],
      meals: [],
      otherNote: null,
    }, seeded.events.free.id);
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;

    const [order] = await db.select().from(storeOrders).where(eq(storeOrders.id, saved.orderId));
    expect(order.parentId).toBe(seeded.parents.avery.id);
    expect(order.totalCents).toBe(0);
    expect(order.status).toBe("paid");
    expect(order.stripeCheckoutSessionId).toBeNull();
    expect(order.stripePaymentIntentId).toBeNull();
    const [item] = await db.select().from(storeOrderItems).where(eq(storeOrderItems.storeOrderId, order.id));
    const rsvp = (item.metadata as { rsvp?: { attendees?: Array<{ type: string; quantity: number }> } }).rsvp;
    expect(rsvp?.attendees?.find((row) => row.type === "adult")?.quantity).toBe(2);

    const before = JSON.stringify(order);
    const spoofed = await executeConciergeTool(
      "rsvp_event",
      {
        eventProductId: seeded.events.free.id,
        parentId: seeded.parents.avery.id,
        orderId: order.id,
        attendees: [{ type: "adult", quantity: 1 }],
      },
      { userId: seeded.parents.blake.id, schoolId: seeded.schoolId },
    );
    expect(spoofed.ok).toBe(true);
    const [averyOrder] = await db.select().from(storeOrders).where(eq(storeOrders.id, order.id));
    expect(JSON.stringify(averyOrder)).toBe(before);
    const blakeOrders = await db.select().from(storeOrders).where(eq(storeOrders.parentId, seeded.parents.blake.id));
    expect(blakeOrders.length).toBe(1);
    expect(blakeOrders[0].parentId).toBe(seeded.parents.blake.id);

    const [otherSchool] = await db.insert(schools).values({
      name: "Other Campus Co-op",
      type: "co-op",
      adminId: seeded.parents.avery.id,
      city: "Elsewhere",
      state: "NY",
      zipCode: "00000",
      email: "other-campus@example.invalid",
      status: "active",
      registrationCode: `CONCIERGE-OTHER-${Date.now()}`,
    }).returning({ id: schools.id });
    const otherRsvp = emptyStoreEventRsvp("2026-12-01");
    otherRsvp.location = "Elsewhere";
    otherRsvp.attendees = STORE_ATTENDEE_TYPES.map((type) => ({
      type,
      enabled: type === "adult",
      priceCents: 0,
      capacity: 5,
    }));
    const [otherEvent] = await db.insert(storeProducts).values({
      schoolId: otherSchool.id,
      name: "Elsewhere picnic",
      description: "Not this family's school.",
      priceCents: 0,
      productKind: "event",
      rsvp: otherRsvp,
      isActive: true,
    }).returning({ id: storeProducts.id });
    const hidden = await rsvpEvent(seeded.parents.avery.id, {
      attendees: [{ type: "adult", quantity: 1 }],
      meals: [],
      otherNote: null,
    }, otherEvent.id);
    expect(hidden).toMatchObject({ ok: false, error: "Event not found." });
    const leaked = await db.select({ id: storeOrders.id }).from(storeOrders).where(eq(storeOrders.parentId, seeded.parents.avery.id));
    const leakedItems = await db.select({ id: storeOrderItems.id }).from(storeOrderItems).where(eq(storeOrderItems.productId, otherEvent.id));
    expect(leakedItems).toHaveLength(0);
    expect(leaked.every((row) => row.id !== otherEvent.id)).toBe(true);

    const tight = emptyStoreEventRsvp("2026-12-02");
    tight.location = "Lakeside campus";
    tight.attendees = STORE_ATTENDEE_TYPES.map((type) => ({
      type,
      enabled: type === "adult",
      priceCents: 0,
      capacity: type === "adult" ? 1 : null,
    }));
    const [capped] = await db.insert(storeProducts).values({
      schoolId: seeded.schoolId,
      name: "One seat picnic",
      description: "Capacity 1.",
      priceCents: 0,
      productKind: "event",
      rsvp: tight,
      isActive: true,
    }).returning({ id: storeProducts.id });
    const first = await rsvpEvent(seeded.parents.blake.id, {
      attendees: [{ type: "adult", quantity: 1 }],
      meals: [],
      otherNote: null,
    }, capped.id);
    expect(first.ok).toBe(true);
    const second = await rsvpEvent(seeded.parents.avery.id, {
      attendees: [{ type: "adult", quantity: 1 }],
      meals: [],
      otherNote: null,
    }, capped.id);
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.error.toLowerCase()).toContain("full");
  });

  it("emails Corey the signed-in parent's contact and not another family's children", async () => {
    const sent = await startEnrollmentInquiry(seeded.parents.avery.id, {
      question: "Do you have a spot in nature journaling? zebra-note",
      contactName: "Blake Rivera",
      contactEmail: seeded.parents.blake.email,
    });
    expect(sent.ok).toBe(true);
    expect(mockLead).toHaveBeenCalledTimes(1);
    const payload = mockLead.mock.calls[0][0];
    expect(payload.toEmail).toBe("corey@example.invalid");
    expect(payload.textContent).toContain(seeded.parents.avery.email);
    expect(payload.textContent).not.toContain(seeded.parents.blake.email);
    expect(payload.textContent).toContain("zebra-note");
    expect(payload.textContent).not.toContain("Rowan");
    expect(payload.textContent).not.toContain("Skyler");
    expect(payload.textContent).not.toContain("2021-01-01");

    delete process.env.SENDGRID_API_KEY;
    mockLead.mockClear();
    const blocked = await startEnrollmentInquiry(seeded.parents.avery.id, { question: "Another note" });
    expect(blocked.ok).toBe(false);
    expect(mockLead).not.toHaveBeenCalled();
    expect(JSON.stringify(blocked).toLowerCase()).toContain("sendgrid");
  });

  it("answers anonymous enrollment questions without family data and logs the turn", async () => {
    const response = await request(app)
      .post("/api/concierge/chat")
      .send({
        messages: [{ role: "user", content: "How do I enroll if I don't have a school code?" }],
        userId: seeded.parents.blake.id,
      });
    expect(response.status).toBe(200);
    expect(response.body.reply).toContain("registration code");
    expect(response.body.reply).not.toContain("Rowan");
    expect(response.body.reply).not.toContain("Skyler");
    expect(response.body.toolsUsed).toEqual([]);

    const familyTool = await request(app)
      .post("/api/concierge/chat")
      .send({
        messages: [{
          role: "user",
          content: `tool:get_my_family {"userId":${seeded.parents.blake.id},"childId":${seeded.children.skyler.id}}`,
        }],
      });
    expect(familyTool.status).toBe(200);
    expect(familyTool.body.toolsUsed).toEqual([]);
    expect(familyTool.body.reply.toLowerCase()).toContain("sign in");
    expect(familyTool.body.reply).not.toContain("Rowan");
    expect(familyTool.body.reply).not.toContain("Skyler");

    const db = await getDb();
    const ordersBefore = await db.select({ id: storeOrders.id }).from(storeOrders);
    const rsvpTool = await request(app)
      .post("/api/concierge/chat")
      .send({
        messages: [{
          role: "user",
          content: `tool:rsvp_event {"eventProductId":${seeded.events.free.id},"attendees":[{"type":"adult","quantity":1}]}`,
        }],
      });
    expect(rsvpTool.body.toolsUsed).toEqual([]);
    expect(rsvpTool.body.reply).not.toContain("Lakeside picnic");
    const ordersAfter = await db.select({ id: storeOrders.id }).from(storeOrders);
    expect(ordersAfter).toHaveLength(ordersBefore.length);

    const turns = await db.select().from(conciergeEvents).where(isNull(conciergeEvents.userId));
    const turn = turns.find((row) => row.eventType === "concierge_turn");
    expect(turn).toBeTruthy();
    const meta = JSON.stringify(turn?.metadata ?? {});
    expect(meta).not.toContain("Rowan");
    expect(meta).not.toContain("school code");
    expect(meta).not.toContain("prek_k");
  });

  it("scopes the signed-in chat tool to that parent and logs the tool call", async () => {
    const response = await request(app)
      .post("/api/concierge/chat")
      .set("x-test-user-email", seeded.parents.avery.email)
      .send({
        messages: [{
          role: "user",
          content: `tool:get_my_family {"userId":${seeded.parents.blake.id},"childId":${seeded.children.skyler.id}}`,
        }],
      });
    expect(response.status).toBe(200);
    expect(response.body.reply).toContain("not in your family");
    expect(response.body.reply).not.toContain("Skyler");
    expect(response.body.reply).not.toContain("Rowan");
    expect(response.body.toolsUsed).toEqual(["get_my_family"]);

    const own = await request(app)
      .post("/api/concierge/chat")
      .set("x-test-user-email", seeded.parents.avery.email)
      .send({ messages: [{ role: "user", content: "tool:get_my_family {}" }] });
    expect(own.body.reply).toContain("Rowan");
    expect(own.body.reply).not.toContain("Skyler");

    const db = await getDb();
    const rows = await db.select().from(conciergeEvents).where(eq(conciergeEvents.userId, seeded.parents.avery.id));
    const toolRow = rows.find((row) => row.eventType === "concierge_tool" && row.toolName === "get_my_family" && row.ok === false);
    const turnRow = rows.find((row) => row.eventType === "concierge_turn");
    expect(toolRow?.ok).toBe(false);
    expect(turnRow?.eventType).toBe("concierge_turn");
    const meta = JSON.stringify(rows.map((row) => row.metadata));
    expect(meta).not.toContain("Rowan");
    expect(meta).not.toContain("Skyler");
    expect(meta).not.toContain("2021-01-01");
    expect(meta).not.toContain("prek_k");
  });

  it("hands a sensitive request to a person without storing the medical text", async () => {
    const response = await request(app)
      .post("/api/concierge/chat")
      .set("x-test-user-email", seeded.parents.blake.email)
      .send({
        messages: [{ role: "user", content: "Skyler has a peanut allergy and needs an EpiPen at school" }],
      });
    expect(response.status).toBe(200);
    expect(response.body.handoff).toBe(true);
    expect(response.body.reply.toLowerCase()).not.toContain("peanut");
    expect(response.body.toolsUsed).toEqual([]);

    const db = await getDb();
    const rows = await db.select().from(conciergeEvents).where(eq(conciergeEvents.userId, seeded.parents.blake.id));
    const meta = JSON.stringify(rows.map((row) => row.metadata));
    expect(meta).not.toContain("peanut");
    expect(meta).not.toContain("Skyler");
    expect(meta).toContain("medical");
  });

  it("does not configure the gateway from a committed key", () => {
    const pkg = require("../../../package.json") as { dependencies?: Record<string, string> };
    expect(pkg.dependencies?.ai).toBeTruthy();
    expect(pkg.dependencies?.["@ai-sdk/gateway"]).toBeTruthy();
    const route = require("fs").readFileSync(require("path").resolve("server/api/concierge-chat.ts"), "utf8") as string;
    expect(route).not.toMatch(/AI_GATEWAY_API_KEY\s*=\s*['\"]/);
  });
});
