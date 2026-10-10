import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "../../db";
import { children, storeOrderItems, storeOrders, storeProducts, users } from "@shared/schema";
import {
  parseStoreEventRsvp,
  priceEventRsvp,
  storeEventRsvpAnswerSchema,
  type StoreAttendeeType,
} from "@shared/store-event-rsvp";
import { generateStoreAccessToken } from "../../lib/store-config";
import { createStoreOrder, createStoreOrderItem } from "../../lib/store-storage";
import { assertParentUserId } from "./guardrails";
import { getMyFamily } from "./family";

async function countPaidAttendees(productId: number): Promise<Partial<Record<StoreAttendeeType, number>>> {
  const db = await getDb();
  const rows = await db
    .select({ metadata: storeOrderItems.metadata })
    .from(storeOrderItems)
    .innerJoin(storeOrders, eq(storeOrders.id, storeOrderItems.storeOrderId))
    .where(and(eq(storeOrderItems.productId, productId), eq(storeOrders.status, "paid")));

  const sold: Partial<Record<StoreAttendeeType, number>> = {};
  for (const row of rows) {
    const attendees = (row.metadata as { rsvp?: { attendees?: Array<{ type?: string; quantity?: number }> } } | null)
      ?.rsvp?.attendees;
    if (!Array.isArray(attendees)) continue;
    for (const attendee of attendees) {
      if (attendee.type !== "adult" && attendee.type !== "children" && attendee.type !== "guests") continue;
      const qty = typeof attendee.quantity === "number" ? attendee.quantity : 0;
      sold[attendee.type] = (sold[attendee.type] ?? 0) + qty;
    }
  }
  return sold;
}

export type RsvpToolResult =
  | {
      ok: true;
      handoff: false;
      orderId: number;
      eventName: string;
      totalCents: 0;
      rsvp: unknown;
    }
  | { ok: false; handoff: boolean; error: string };

/**
 * Records a $0 store-event RSVP for the signed-in parent.
 * Uses store_orders.parent_id and store_order_items.metadata.rsvp.
 * Does not call Stripe, does not write a payment row, and does not update another parent's order.
 */
export async function rsvpEvent(
  userId: number,
  answerInput: unknown,
  eventProductId: number,
): Promise<RsvpToolResult> {
  const id = assertParentUserId(userId);
  const db = await getDb();
  const [parent] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      schoolId: users.schoolId,
    })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  if (!parent) return { ok: false, handoff: false, error: "Parent account was not found." };

  const family = await getMyFamily(id);
  const schoolIds = new Set<number>();
  if (parent.schoolId != null) schoolIds.add(parent.schoolId);
  if (family.ok && family.children.length > 0) {
    const rows = await db
      .select({ schoolId: children.schoolId })
      .from(children)
      .where(inArray(children.id, family.children.map((child) => child.id)));
    for (const row of rows) {
      if (row.schoolId != null) schoolIds.add(row.schoolId);
    }
  }

  const [product] = await db
    .select({
      id: storeProducts.id,
      schoolId: storeProducts.schoolId,
      name: storeProducts.name,
      productKind: storeProducts.productKind,
      isActive: storeProducts.isActive,
      rsvp: storeProducts.rsvp,
    })
    .from(storeProducts)
    .where(eq(storeProducts.id, eventProductId))
    .limit(1);

  if (!product || product.productKind !== "event" || !product.isActive || !schoolIds.has(product.schoolId)) {
    return { ok: false, handoff: false, error: "Event not found." };
  }

  const config = parseStoreEventRsvp(product.rsvp);
  if (!config) {
    return { ok: false, handoff: true, error: "This event is not ready for RSVP. A person at the school can help." };
  }

  if (config.attendees.some((row) => row.enabled && row.priceCents > 0)) {
    return {
      ok: false,
      handoff: true,
      error: "This event has a price, so I can't RSVP you from chat. A person at the school can help you sign up.",
    };
  }

  const parsedAnswer = storeEventRsvpAnswerSchema.safeParse(answerInput);
  if (!parsedAnswer.success) {
    return { ok: false, handoff: false, error: "RSVP answers are invalid." };
  }

  const soldByType = await countPaidAttendees(product.id);
  const priced = priceEventRsvp({ config, answer: parsedAnswer.data, soldByType });
  if (!priced.ok) return { ok: false, handoff: false, error: priced.unavailableReason };
  if (priced.lineTotalCents > 0) {
    return {
      ok: false,
      handoff: true,
      error: "This RSVP would cost money, so I didn't record it. A person at the school can help.",
    };
  }

  const order = await createStoreOrder({
    schoolId: product.schoolId,
    parentId: parent.id,
    parentEmail: parent.email,
    parentName: parent.name,
    status: "paid",
    totalCents: 0,
    accessToken: generateStoreAccessToken(),
    metadata: { source: "concierge" },
  });
  await createStoreOrderItem({
    storeOrderId: order.id,
    productId: product.id,
    name: product.name,
    quantity: priced.headcount,
    unitPriceCents: 0,
    lineTotalCents: 0,
    metadata: { rsvp: priced.eventRsvp },
  });

  return {
    ok: true,
    handoff: false,
    orderId: order.id,
    eventName: product.name,
    totalCents: 0,
    rsvp: priced.eventRsvp,
  };
}
