import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "@jest/globals";
import { assertLocalPostgresUrl, ConciergeSeedRefused } from "../../scripts/lib/concierge-local-guard";
import { detectSensitiveRequest, handoffMessage, sanitizeConciergeMetadata, assertParentUserId } from "../services/concierge/guardrails";
import { answerFromEnrollmentCorpus, ENROLLMENT_CORPUS } from "../services/concierge/enrollment-corpus";
import { buildConciergeSystemPrompt } from "../services/concierge/prompts";
import { resolveConciergeMode } from "../services/concierge/mode";
import { CONCIERGE_TOOL_NAMES, FORBIDDEN_CONCIERGE_TOOL_NAMES, toolsForActor } from "../services/concierge/tool-names";

const root = resolve(__dirname, "../..");

describe("concierge guardrails", () => {
  it("hands payment, medical, custody, and child registration to a person", () => {
    expect(detectSensitiveRequest("Can you charge my card?")?.code).toBe("payment");
    expect(detectSensitiveRequest("Rowan has a peanut allergy")?.code).toBe("medical");
    expect(detectSensitiveRequest("Update custody for pickup")?.code).toBe("custody");
    expect(detectSensitiveRequest("Please register a child named Quinn")?.code).toBe("child_registration");
    expect(handoffMessage("medical").toLowerCase()).not.toContain("peanut");
  });

  it("drops child profile fields from analytics metadata", () => {
    const clean = sanitizeConciergeMetadata({
      anonymous: true,
      handoff: true,
      handoffCode: "medical",
      messageChars: 42,
      mode: "mock",
      birthdate: "2021-01-01",
      allergies: "peanuts",
      childName: "Rowan",
      gradeLevel: "prek_k",
      question: "a long parent question that must not be stored",
      email: "avery.quinn@example.invalid",
    });
    expect(clean).toEqual({
      anonymous: true,
      handoff: true,
      handoffCode: "medical",
      messageChars: 42,
      mode: "mock",
    });
  });

  it("accepts only an integer users.id", () => {
    expect(assertParentUserId(4)).toBe(4);
    expect(() => assertParentUserId("00000000-0000-0000-0000-000000000001")).toThrow(/integer users.id/);
    expect(() => assertParentUserId(0)).toThrow(/integer users.id/);
  });

  it("answers anonymous enrollment questions only from the published notes", () => {
    const answer = answerFromEnrollmentCorpus("How do I enroll without a school code?");
    expect(answer.grounded).toBe(true);
    expect(answer.text).toContain("registration code");
    expect(answer.text).not.toContain("Rowan");
    const unknown = answerFromEnrollmentCorpus("What is the secret staff wifi password?");
    expect(unknown.grounded).toBe(false);
    expect(ENROLLMENT_CORPUS.every((entry) => entry.text.length > 0)).toBe(true);
  });

  it("keeps family tools off the anonymous prompt and payment tools off both prompts", () => {
    const anon = buildConciergeSystemPrompt(false);
    const signedIn = buildConciergeSystemPrompt(true);
    expect(anon).toContain("registration code");
    expect(anon).not.toContain("get_my_family");
    expect(signedIn).toContain("get_my_family");
    for (const name of FORBIDDEN_CONCIERGE_TOOL_NAMES) {
      expect(anon).not.toContain(name);
      expect(signedIn).not.toContain(name);
    }
    expect(toolsForActor(false)).toEqual(["start_enrollment_inquiry"]);
    expect(toolsForActor(true)).toEqual([...CONCIERGE_TOOL_NAMES]);
  });

  it("uses the gateway only when a key is configured", () => {
    const previousMock = process.env.CONCIERGE_AI_MOCK;
    const previousKey = process.env.AI_GATEWAY_API_KEY;
    delete process.env.CONCIERGE_AI_MOCK;
    delete process.env.AI_GATEWAY_API_KEY;
    expect(resolveConciergeMode()).toBe("unconfigured");
    process.env.AI_GATEWAY_API_KEY = "test-not-a-real-key";
    expect(resolveConciergeMode()).toBe("gateway");
    process.env.CONCIERGE_AI_MOCK = "1";
    expect(resolveConciergeMode()).toBe("mock");
    if (previousMock === undefined) delete process.env.CONCIERGE_AI_MOCK;
    else process.env.CONCIERGE_AI_MOCK = previousMock;
    if (previousKey === undefined) delete process.env.AI_GATEWAY_API_KEY;
    else process.env.AI_GATEWAY_API_KEY = previousKey;
  });

  it("refuses to seed anything but local postgres", () => {
    expect(() => assertLocalPostgresUrl(undefined)).toThrow(ConciergeSeedRefused);
    expect(() => assertLocalPostgresUrl("postgresql://user:pass@db.neon.tech/asa_concierge_local")).toThrow(/not local/);
    expect(() => assertLocalPostgresUrl("postgresql://user:pass@localhost/asa_production")).toThrow(/production/);
    expect(() => assertLocalPostgresUrl("postgresql://user:pass@127.0.0.1:5432/asa")).toThrow(/local or test/);
    expect(() => assertLocalPostgresUrl("postgresql://user:pass@127.0.0.1:5432/asa_concierge_local")).not.toThrow();
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      expect(() => assertLocalPostgresUrl("postgresql://user:pass@127.0.0.1:5432/asa_concierge_local")).toThrow(/production/);
    } finally {
      process.env.NODE_ENV = previous;
    }
  });

  it("does not mount the Anthropic concierge router or send leads through Brevo", () => {
    const index = readFileSync(resolve(root, "server/index.ts"), "utf8");
    expect(index).not.toMatch(/api\/parent-concierge/);
    expect(index).toContain('"/api/concierge"');
    const email = readFileSync(resolve(root, "server/lib/email-service.ts"), "utf8");
    const start = email.indexOf("export async function sendConciergeLeadEmail");
    const end = email.indexOf("export async function sendProgressReportEmail");
    const fn = email.slice(start, end);
    expect(fn).toContain("SENDGRID_API_KEY");
    expect(fn).toContain("sendViaSendGrid");
    expect(fn).not.toContain("sendViaBrevo");
    const rsvp = readFileSync(resolve(root, "server/services/concierge/rsvp.ts"), "utf8");
    expect(rsvp).not.toMatch(/from ['"].*stripe|getStripeClient|paymentIntents/);
    const inquiry = readFileSync(resolve(root, "server/services/concierge/inquiry.ts"), "utf8");
    expect(inquiry).not.toMatch(/programEnrollments|children/);
    const tools = readFileSync(resolve(root, "server/services/concierge/tools.ts"), "utf8");
    for (const name of FORBIDDEN_CONCIERGE_TOOL_NAMES) {
      expect(tools).not.toContain(name);
    }
  });
});
