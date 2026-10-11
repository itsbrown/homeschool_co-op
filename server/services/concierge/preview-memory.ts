import {
  emptyStoreEventRsvp,
  parseStoreEventRsvp,
  priceEventRsvp,
  STORE_ATTENDEE_TYPES,
  storeEventRsvpAnswerSchema,
  type StoreAttendeeType,
  type StoreEventRsvp,
} from "@shared/store-event-rsvp";
import type { ConciergeAnalyticsInput } from "./analytics";
import { assertParentUserId, sanitizeConciergeMetadata } from "./guardrails";
import { assertPreviewDemoAllowed } from "./preview-demo-guard";
import type { FamilySnapshot } from "./family";
import type { InquiryInput, InquiryResult } from "./inquiry";
import type { RsvpToolResult } from "./rsvp";
import { sendConciergeLeadEmail } from "../../lib/email-service";

export const PREVIEW_DEMO_WEEK_START = "2026-10-05";

export const PREVIEW_DEMO_IDS = {
  school: 1,
  avery: 2,
  blake: 3,
  casey: 4,
  rowan: 5,
  quinn: 6,
  skyler: 7,
  reese: 8,
  nature: 9,
  studio: 10,
  freeEvent: 11,
  paidEvent: 12,
} as const;

type DemoParent = {
  id: number;
  key: "avery" | "blake" | "casey";
  name: string;
  email: string;
  phone: string;
  schoolId: number;
  schoolName: string;
  campus: string;
};

type DemoChild = {
  id: number;
  firstName: string;
  lastName: string;
  gradeLevel: string;
  campus: string;
  schoolId: number;
  parentId: number;
  guardianIds: number[];
  enrollments: Array<{ status: string; className: string; classId: number | null }>;
};

type DemoBlock = {
  title: string;
  description: string;
  objectives: string[];
  materials: string[];
  homework: string | null;
  lessonLink: string | null;
  published: boolean;
};

type DemoOrder = {
  id: number;
  parentId: number;
  productId: number;
  attendees: Array<{ type: StoreAttendeeType; quantity: number }>;
};

const parents: DemoParent[] = [
  {
    id: PREVIEW_DEMO_IDS.avery,
    key: "avery",
    name: "Avery Quinn",
    email: "avery.quinn@example.invalid",
    phone: "555-010-0199",
    schoolId: PREVIEW_DEMO_IDS.school,
    schoolName: "Northwood Seekers Co-op",
    campus: "Lakeside",
  },
  {
    id: PREVIEW_DEMO_IDS.blake,
    key: "blake",
    name: "Blake Rivera",
    email: "blake.rivera@example.invalid",
    phone: "555-010-0199",
    schoolId: PREVIEW_DEMO_IDS.school,
    schoolName: "Northwood Seekers Co-op",
    campus: "Lakeside",
  },
  {
    id: PREVIEW_DEMO_IDS.casey,
    key: "casey",
    name: "Casey Nguyen",
    email: "casey.nguyen@example.invalid",
    phone: "555-010-0199",
    schoolId: PREVIEW_DEMO_IDS.school,
    schoolName: "Northwood Seekers Co-op",
    campus: "Lakeside",
  },
];

const children: DemoChild[] = [
  {
    id: PREVIEW_DEMO_IDS.rowan,
    firstName: "Rowan",
    lastName: "Student",
    gradeLevel: "prek_k",
    campus: "Lakeside",
    schoolId: PREVIEW_DEMO_IDS.school,
    parentId: PREVIEW_DEMO_IDS.avery,
    guardianIds: [PREVIEW_DEMO_IDS.casey],
    enrollments: [{ status: "enrolled", className: "Nature Journaling", classId: PREVIEW_DEMO_IDS.nature }],
  },
  {
    id: PREVIEW_DEMO_IDS.quinn,
    firstName: "Quinn",
    lastName: "Student",
    gradeLevel: "grades_1_3",
    campus: "Lakeside",
    schoolId: PREVIEW_DEMO_IDS.school,
    parentId: PREVIEW_DEMO_IDS.avery,
    guardianIds: [],
    enrollments: [],
  },
  {
    id: PREVIEW_DEMO_IDS.skyler,
    firstName: "Skyler",
    lastName: "Student",
    gradeLevel: "grades_4_8",
    campus: "Lakeside",
    schoolId: PREVIEW_DEMO_IDS.school,
    parentId: PREVIEW_DEMO_IDS.blake,
    guardianIds: [],
    enrollments: [{ status: "enrolled", className: "Studio Art", classId: PREVIEW_DEMO_IDS.studio }],
  },
  {
    id: PREVIEW_DEMO_IDS.reese,
    firstName: "Reese",
    lastName: "Student",
    gradeLevel: "grades_9_12",
    campus: "Lakeside",
    schoolId: PREVIEW_DEMO_IDS.school,
    parentId: PREVIEW_DEMO_IDS.blake,
    guardianIds: [],
    enrollments: [],
  },
];

const blocksByClass = new Map<number, DemoBlock[]>([
  [
    PREVIEW_DEMO_IDS.nature,
    [
      {
        title: "Leaf rubbings",
        description: "Collect leaves and make rubbings.",
        objectives: ["Notice leaf shapes"],
        materials: ["Paper", "crayons"],
        homework: null,
        lessonLink: null,
        published: true,
      },
    ],
  ],
  [
    PREVIEW_DEMO_IDS.studio,
    [
      {
        title: "Color wheel",
        description: "Mix primary colors.",
        objectives: ["Name primary colors"],
        materials: ["Paint"],
        homework: null,
        lessonLink: null,
        published: true,
      },
    ],
  ],
]);

function eventConfig(startsOn: string, adultPriceCents: number, adultCapacity: number | null): StoreEventRsvp {
  const rsvp = emptyStoreEventRsvp(startsOn);
  rsvp.location = "Lakeside campus";
  rsvp.startTime = "11:00";
  rsvp.endTime = "13:00";
  rsvp.closeOn = null;
  rsvp.attendees = STORE_ATTENDEE_TYPES.map((type) => ({
    type,
    enabled: type === "adult" || (adultPriceCents > 0 && type === "children"),
    priceCents: type === "adult" ? adultPriceCents : 0,
    capacity: type === "adult" ? adultCapacity : null,
  }));
  return rsvp;
}

const events: Array<{ id: number; name: string; schoolId: number; rsvp: StoreEventRsvp }> = [
  {
    id: PREVIEW_DEMO_IDS.freeEvent,
    name: "Lakeside picnic",
    schoolId: PREVIEW_DEMO_IDS.school,
    rsvp: eventConfig("2026-10-17", 0, 20),
  },
  {
    id: PREVIEW_DEMO_IDS.paidEvent,
    name: "Harvest supper",
    schoolId: PREVIEW_DEMO_IDS.school,
    rsvp: eventConfig("2026-10-24", 2500, 40),
  },
];

let orders: DemoOrder[] = [];
let nextOrderId = 1;
let analytics: ConciergeAnalyticsInput[] = [];
let leads: Array<{ toEmail: string | null; contactName: string; contactEmail: string; question: string; sent: boolean }> = [];

export function resetPreviewDemoMemory(): void {
  orders = [];
  nextOrderId = 1;
  analytics = [];
  leads = [];
}

export function previewDemoAnalytics(): ConciergeAnalyticsInput[] {
  return analytics.map((row) => ({ ...row, metadata: { ...row.metadata } }));
}

export function previewDemoLeads(): typeof leads {
  return leads.map((row) => ({ ...row }));
}

export function previewDemoParentByKey(key: string): DemoParent | null {
  return parents.find((parent) => parent.key === key) ?? null;
}

export function previewDemoParentById(id: number): DemoParent | null {
  return parents.find((parent) => parent.id === id) ?? null;
}

const CHILD_NOT_IN_FAMILY = "That child is not in your family.";

function familyChildren(userId: number, schoolId: number): DemoChild[] {
  return children.filter((child) =>
    child.schoolId === schoolId && (child.parentId === userId || child.guardianIds.includes(userId)),
  );
}

function selectRequestedChild(
  rows: DemoChild[],
  requestedChildId?: number,
): { ok: true; rows: DemoChild[] } | { ok: false; error: string } {
  if (requestedChildId == null) return { ok: true, rows };
  const match = rows.filter((row) => row.id === requestedChildId);
  if (match.length === 0) return { ok: false, error: CHILD_NOT_IN_FAMILY };
  return { ok: true, rows: match };
}

export function previewGetMyFamily(
  userId: number,
  requestedChildId?: number,
): FamilySnapshot | { ok: false; error: string } {
  assertPreviewDemoAllowed();
  const id = assertParentUserId(userId);
  const parent = previewDemoParentById(id);
  if (!parent) return { ok: false, error: "Parent account was not found." };
  const selected = selectRequestedChild(familyChildren(id, parent.schoolId), requestedChildId);
  if (!selected.ok) return selected;
  const rows = selected.rows;
  return {
    ok: true,
    parent: {
      id: parent.id,
      name: parent.name,
      email: parent.email,
      phone: parent.phone,
      schoolName: parent.schoolName,
      campus: parent.campus,
    },
    children: rows.map((row) => ({
      id: row.id,
      firstName: row.firstName,
      lastName: row.lastName,
      gradeLevel: row.gradeLevel,
      campus: row.campus,
      enrollments: row.enrollments.map((enrollment) => ({
        status: enrollment.status,
        className: enrollment.className,
      })),
    })),
  };
}

export function previewGetWeekMaterials(
  userId: number,
  input: { weekStart?: string; childId?: number },
):
  | {
      ok: true;
      weekStart: string;
      children: Array<{
        childId: number;
        childFirstName: string;
        childLastName: string;
        classId: number;
        classTitle: string;
        blocks: Array<{
          title: string | null;
          description: string | null;
          objectives: string[];
          materials: string[] | null;
          homework: string | null;
          lessonLink: string | null;
        }>;
      }>;
    }
  | { ok: false; error: string } {
  assertPreviewDemoAllowed();
  const id = assertParentUserId(userId);
  const parent = previewDemoParentById(id);
  if (!parent) return { ok: false, error: "Parent account was not found." };
  const weekStart = input.weekStart && /^\d{4}-\d{2}-\d{2}$/.test(input.weekStart)
    ? input.weekStart
    : PREVIEW_DEMO_WEEK_START;
  const selected = selectRequestedChild(familyChildren(id, parent.schoolId), input.childId);
  if (!selected.ok) return selected;
  const rows = selected.rows;
  const out = [];
  for (const child of rows) {
    for (const enrollment of child.enrollments) {
      if (enrollment.status !== "enrolled" || enrollment.classId == null) continue;
      const published = (blocksByClass.get(enrollment.classId) ?? []).filter((block) => block.published);
      if (weekStart !== PREVIEW_DEMO_WEEK_START) continue;
      out.push({
        childId: child.id,
        childFirstName: child.firstName,
        childLastName: child.lastName,
        classId: enrollment.classId,
        classTitle: enrollment.className,
        blocks: published.map((block) => ({
          title: block.title,
          description: block.description,
          objectives: block.objectives,
          materials: block.materials,
          homework: block.homework,
          lessonLink: block.lessonLink,
        })),
      });
    }
  }
  return { ok: true, weekStart, children: out };
}

function soldByType(productId: number): Partial<Record<StoreAttendeeType, number>> {
  const sold: Partial<Record<StoreAttendeeType, number>> = {};
  for (const order of orders) {
    if (order.productId !== productId) continue;
    for (const attendee of order.attendees) {
      sold[attendee.type] = (sold[attendee.type] ?? 0) + attendee.quantity;
    }
  }
  return sold;
}

export function previewRsvpEvent(
  userId: number,
  answerInput: unknown,
  eventProductId: number,
): RsvpToolResult {
  assertPreviewDemoAllowed();
  const id = assertParentUserId(userId);
  const parent = previewDemoParentById(id);
  if (!parent) return { ok: false, handoff: false, error: "Parent account was not found." };
  const product = events.find((event) => event.id === eventProductId && event.schoolId === parent.schoolId);
  if (!product) return { ok: false, handoff: false, error: "Event not found." };
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
  if (!parsedAnswer.success) return { ok: false, handoff: false, error: "RSVP answers are invalid." };
  const priced = priceEventRsvp({ config, answer: parsedAnswer.data, soldByType: soldByType(product.id) });
  if (!priced.ok) return { ok: false, handoff: false, error: priced.unavailableReason };
  if (priced.lineTotalCents > 0) {
    return {
      ok: false,
      handoff: true,
      error: "This RSVP would cost money, so I didn't record it. A person at the school can help.",
    };
  }
  const orderId = nextOrderId++;
  orders.push({
    id: orderId,
    parentId: parent.id,
    productId: product.id,
    attendees: parsedAnswer.data.attendees.map((row) => ({ type: row.type, quantity: row.quantity })),
  });
  return {
    ok: true,
    handoff: false,
    orderId,
    eventName: product.name,
    totalCents: 0,
    rsvp: priced.eventRsvp,
  };
}

export function recordPreviewDemoAnalytics(input: ConciergeAnalyticsInput): void {
  assertPreviewDemoAllowed();
  analytics.push({
    ...input,
    metadata: sanitizeConciergeMetadata(input.metadata ?? {}),
  });
}

export async function previewStartEnrollmentInquiry(
  userId: number | null,
  input: InquiryInput,
  send: typeof sendConciergeLeadEmail = sendConciergeLeadEmail,
): Promise<InquiryResult> {
  assertPreviewDemoAllowed();
  const question = input.question?.trim() ?? "";
  if (!question) return { ok: false, handoff: true, error: "Add the question you want Corey to see." };

  let contactName = input.contactName?.trim() || "";
  let contactEmail = input.contactEmail?.trim() || "";
  if (userId != null) {
    const parent = previewDemoParentById(assertParentUserId(userId));
    if (!parent) return { ok: false, handoff: true, error: "Parent account was not found." };
    contactName = parent.name;
    contactEmail = parent.email;
  }
  if (!contactName || !contactEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
    return {
      ok: false,
      handoff: true,
      error: "I need your name and email before I can ask Corey to follow up.",
    };
  }

  const leadEmail = process.env.CONCIERGE_LEAD_EMAIL?.trim() || null;
  const canSend = Boolean(leadEmail && process.env.SENDGRID_API_KEY?.trim());
  leads.push({ toEmail: leadEmail, contactName, contactEmail, question, sent: canSend });
  console.log(
    `[concierge-preview] enrollment lead ${canSend ? "sending" : "logged"} for ${contactEmail}`,
  );

  if (!canSend) {
    return {
      ok: true,
      handoff: true,
      message:
        "I logged your question for Corey on this preview. Email is not configured, so it was not sent. This is not an enrollment.",
    };
  }

  const text = [`Name: ${contactName}`, `Email: ${contactEmail}`, "", question].join("\n");
  const sent = await send({
    toEmail: leadEmail as string,
    toName: "Corey",
    subject: `Enrollment inquiry from ${contactName}`,
    htmlContent: `<p>${text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>")}</p>`,
    textContent: text,
  });
  if (!sent) {
    return {
      ok: false,
      handoff: true,
      error: "The note to Corey did not send. Please contact the school directly.",
    };
  }
  return {
    ok: true,
    handoff: true,
    message: "I sent your question to Corey. A person will follow up. This is not an enrollment.",
  };
}
