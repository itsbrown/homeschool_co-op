import { z } from "zod";

export const STORE_ATTENDEE_TYPES = ["adult", "children", "guests"] as const;
export type StoreAttendeeType = (typeof STORE_ATTENDEE_TYPES)[number];

export const STORE_MEAL_TYPES = ["gluten_free", "vegan", "dairy_free", "other"] as const;
export type StoreMealType = (typeof STORE_MEAL_TYPES)[number];

export const STORE_ATTENDEE_LABELS: Record<StoreAttendeeType, string> = {
  adult: "Adult",
  children: "Children",
  guests: "Guests",
};

export const STORE_MEAL_LABELS: Record<StoreMealType, string> = {
  gluten_free: "Gluten-free",
  vegan: "Vegan",
  dairy_free: "Dairy-free",
  other: "Other",
};

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const hhmm = z.string().regex(/^\d{2}:\d{2}$/);

export const storeEventAttendeeConfigSchema = z.object({
  type: z.enum(STORE_ATTENDEE_TYPES),
  enabled: z.boolean(),
  priceCents: z.number().int().min(0),
  capacity: z.number().int().positive().nullable(),
});

export const storeEventMealConfigSchema = z.object({
  type: z.enum(STORE_MEAL_TYPES),
  enabled: z.boolean(),
});

export const storeEventRsvpSchema = z
  .object({
    startsOn: ymd,
    startTime: hhmm,
    endTime: hhmm,
    location: z.string().trim().min(1).max(200),
    closeOn: ymd.nullable(),
    attendees: z.array(storeEventAttendeeConfigSchema).length(STORE_ATTENDEE_TYPES.length),
    meals: z.array(storeEventMealConfigSchema).length(STORE_MEAL_TYPES.length),
  })
  .superRefine((value, ctx) => {
    const attendeeTypes = value.attendees.map((row) => row.type);
    if (new Set(attendeeTypes).size !== STORE_ATTENDEE_TYPES.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Attendee types must be unique", path: ["attendees"] });
    }
    for (const type of STORE_ATTENDEE_TYPES) {
      if (!attendeeTypes.includes(type)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Missing attendee ${type}`, path: ["attendees"] });
      }
    }
    const mealTypes = value.meals.map((row) => row.type);
    if (new Set(mealTypes).size !== STORE_MEAL_TYPES.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Meal types must be unique", path: ["meals"] });
    }
    if (!value.attendees.some((row) => row.enabled)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Turn on at least one attendee type",
        path: ["attendees"],
      });
    }
  });

export type StoreEventRsvp = z.infer<typeof storeEventRsvpSchema>;

export const storeEventRsvpAnswerSchema = z.object({
  attendees: z.array(
    z.object({
      type: z.enum(STORE_ATTENDEE_TYPES),
      quantity: z.number().int().min(0),
    }),
  ),
  meals: z.array(
    z.object({
      type: z.enum(STORE_MEAL_TYPES),
      quantity: z.number().int().min(0),
    }),
  ),
  otherNote: z.string().trim().max(240).nullable(),
});

export type StoreEventRsvpAnswer = z.infer<typeof storeEventRsvpAnswerSchema>;

export type StoreEventAttendeeCharge = {
  type: StoreAttendeeType;
  label: string;
  quantity: number;
  unitPriceCents: number;
  lineTotalCents: number;
};

export type StoreEventMealCount = {
  type: StoreMealType;
  label: string;
  quantity: number;
};

/** Priced RSVP stored on the snapshot line and on store_order_items.metadata.rsvp. */
export type StoreEventRsvpSnapshot = {
  startsOn: string;
  startTime: string;
  endTime: string;
  location: string;
  attendees: StoreEventAttendeeCharge[];
  meals: StoreEventMealCount[];
  otherNote: string | null;
};

export function emptyStoreEventRsvp(startsOn = ""): StoreEventRsvp {
  return {
    startsOn,
    startTime: "18:00",
    endTime: "20:00",
    location: "",
    closeOn: null,
    attendees: STORE_ATTENDEE_TYPES.map((type) => ({
      type,
      enabled: type === "adult",
      priceCents: type === "adult" ? 2500 : 0,
      capacity: null,
    })),
    meals: STORE_MEAL_TYPES.map((type) => ({ type, enabled: false })),
  };
}

export function parseStoreEventRsvp(value: unknown): StoreEventRsvp | null {
  const parsed = storeEventRsvpSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** Lowest enabled price above 0, or 0 when every enabled attendee is free. */
export function eventDisplayPriceCents(rsvp: StoreEventRsvp): number {
  const paid = rsvp.attendees.filter((row) => row.enabled && row.priceCents > 0).map((row) => row.priceCents);
  if (paid.length === 0) return 0;
  return Math.min(...paid);
}

export function formatEventWhen(rsvp: Pick<StoreEventRsvpSnapshot, "startsOn" | "startTime" | "endTime">): string {
  return `${rsvp.startsOn} ${rsvp.startTime}–${rsvp.endTime}`;
}

export function todayYmd(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export type PriceEventRsvpResult =
  | { ok: true; lineTotalCents: number; headcount: number; eventRsvp: StoreEventRsvpSnapshot }
  | { ok: false; unavailableReason: string };

export function priceEventRsvp(params: {
  config: StoreEventRsvp;
  answer: StoreEventRsvpAnswer;
  soldByType?: Partial<Record<StoreAttendeeType, number>>;
  today?: string;
}): PriceEventRsvpResult {
  const today = params.today ?? todayYmd();
  const config = params.config;
  if (config.closeOn && today > config.closeOn) {
    return { ok: false, unavailableReason: "RSVP is closed" };
  }

  const answerAttendees = new Map(params.answer.attendees.map((row) => [row.type, row.quantity]));
  const answerMeals = new Map(params.answer.meals.map((row) => [row.type, row.quantity]));

  for (const type of answerAttendees.keys()) {
    const row = config.attendees.find((item) => item.type === type);
    if (!row?.enabled && (answerAttendees.get(type) ?? 0) > 0) {
      return { ok: false, unavailableReason: `${STORE_ATTENDEE_LABELS[type]} is not offered` };
    }
  }
  for (const type of answerMeals.keys()) {
    const row = config.meals.find((item) => item.type === type);
    if (!row?.enabled && (answerMeals.get(type) ?? 0) > 0) {
      return { ok: false, unavailableReason: `${STORE_MEAL_LABELS[type]} is not offered` };
    }
  }

  const attendees: StoreEventAttendeeCharge[] = [];
  let lineTotalCents = 0;
  let headcount = 0;
  for (const row of config.attendees) {
    if (!row.enabled) continue;
    const quantity = answerAttendees.get(row.type) ?? 0;
    if (quantity < 0) {
      return { ok: false, unavailableReason: "Attendee counts must be zero or more" };
    }
    const sold = params.soldByType?.[row.type] ?? 0;
    if (row.capacity != null && sold + quantity > row.capacity) {
      return { ok: false, unavailableReason: `${STORE_ATTENDEE_LABELS[row.type]} is full` };
    }
    const line = quantity * row.priceCents;
    lineTotalCents += line;
    headcount += quantity;
    if (quantity > 0) {
      attendees.push({
        type: row.type,
        label: STORE_ATTENDEE_LABELS[row.type],
        quantity,
        unitPriceCents: row.priceCents,
        lineTotalCents: line,
      });
    }
  }

  if (headcount < 1) {
    return { ok: false, unavailableReason: "Add at least one attendee" };
  }

  const meals: StoreEventMealCount[] = [];
  for (const row of config.meals) {
    if (!row.enabled) continue;
    const quantity = answerMeals.get(row.type) ?? 0;
    if (quantity > 0) {
      meals.push({ type: row.type, label: STORE_MEAL_LABELS[row.type], quantity });
    }
  }

  const otherQty = meals.find((meal) => meal.type === "other")?.quantity ?? 0;
  const otherNote = params.answer.otherNote?.trim() || null;
  if (otherQty > 0 && !otherNote) {
    return { ok: false, unavailableReason: "Describe the other allergy" };
  }

  return {
    ok: true,
    lineTotalCents,
    headcount,
    eventRsvp: {
      startsOn: config.startsOn,
      startTime: config.startTime,
      endTime: config.endTime,
      location: config.location,
      attendees,
      meals,
      otherNote: otherQty > 0 ? otherNote : null,
    },
  };
}

/** Stripe Checkout lines for one snapshot row. $0 attendee types are omitted. */
export function eventStripeLineItems(eventRsvp: StoreEventRsvpSnapshot, eventTitle: string): Array<{
  name: string;
  unitAmountCents: number;
  quantity: number;
}> {
  return eventRsvp.attendees
    .filter((row) => row.quantity > 0 && row.unitPriceCents > 0)
    .map((row) => ({
      name: `${eventTitle} — ${row.label}`,
      unitAmountCents: row.unitPriceCents,
      quantity: row.quantity,
    }));
}

export const STRIPE_MINIMUM_CENTS = 50;

export function isBelowStripeMinimum(amountDueCents: number): boolean {
  return amountDueCents > 0 && amountDueCents < STRIPE_MINIMUM_CENTS;
}
