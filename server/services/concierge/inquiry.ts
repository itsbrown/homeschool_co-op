import { eq } from "drizzle-orm";
import { getDb } from "../../db";
import { users } from "@shared/schema";
import { sendConciergeLeadEmail } from "../../lib/email-service";
import { assertParentUserId } from "./guardrails";

export type InquiryInput = {
  question: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
};

export type InquiryResult =
  | { ok: true; handoff: true; message: string }
  | { ok: false; handoff: true; error: string };

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export async function startEnrollmentInquiry(
  userId: number | null,
  input: InquiryInput,
  send: typeof sendConciergeLeadEmail = sendConciergeLeadEmail,
): Promise<InquiryResult> {
  const question = input.question?.trim() ?? "";
  if (!question) return { ok: false, handoff: true, error: "Add the question you want Corey to see." };

  const leadEmail = process.env.CONCIERGE_LEAD_EMAIL?.trim();
  if (!leadEmail) {
    return {
      ok: false,
      handoff: true,
      error: "CONCIERGE_LEAD_EMAIL is not set, so I could not send this to Corey.",
    };
  }
  if (!process.env.SENDGRID_API_KEY?.trim()) {
    return {
      ok: false,
      handoff: true,
      error: "SendGrid is not configured, so I could not send this to Corey. It was not sent another way.",
    };
  }

  let contactName = input.contactName?.trim() || "";
  let contactEmail = input.contactEmail?.trim() || "";
  let contactPhone = input.contactPhone?.trim() || "";

  if (userId != null) {
    const id = assertParentUserId(userId);
    const db = await getDb();
    const [parent] = await db
      .select({
        name: users.name,
        email: users.email,
        phone: users.phone,
      })
      .from(users)
      .where(eq(users.id, id))
      .limit(1);
    if (!parent) return { ok: false, handoff: true, error: "Parent account was not found." };
    contactName = parent.name;
    contactEmail = parent.email;
    contactPhone = parent.phone ?? "";
  }

  if (!contactName || !contactEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
    return {
      ok: false,
      handoff: true,
      error: "I need your name and email before I can ask Corey to follow up.",
    };
  }

  const subject = `Enrollment inquiry from ${contactName}`;
  const text = [
    `Name: ${contactName}`,
    `Email: ${contactEmail}`,
    contactPhone ? `Phone: ${contactPhone}` : null,
    userId != null ? `Parent user id: ${userId}` : "Parent user id: (not signed in)",
    "",
    question,
  ].filter((line) => line != null).join("\n");
  const html = `<p>${escapeHtml(text).replace(/\n/g, "<br>")}</p>`;

  const sent = await send({
    toEmail: leadEmail,
    toName: "Corey",
    subject,
    htmlContent: html,
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
