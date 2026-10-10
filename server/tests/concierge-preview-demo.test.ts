import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "@jest/globals";
import request from "supertest";
import {
  assertPreviewDemoAllowed,
  databaseUrlLooksLikeProd,
  PreviewDemoRefused,
} from "../services/concierge/preview-demo-guard";
import {
  previewDemoAnalytics,
  previewDemoLeads,
  PREVIEW_DEMO_IDS,
  resetPreviewDemoMemory,
} from "../services/concierge/preview-memory";
import { createPreviewExpressApp } from "../preview/express-app";

const root = resolve(__dirname, "../..");

const saved = {
  demo: process.env.PREVIEW_DEMO_MODE,
  nodeEnv: process.env.NODE_ENV,
  databaseUrl: process.env.DATABASE_URL,
  replId: process.env.REPL_ID,
  replitDeployment: process.env.REPLIT_DEPLOYMENT,
  lead: process.env.CONCIERGE_LEAD_EMAIL,
  sendgrid: process.env.SENDGRID_API_KEY,
  mock: process.env.CONCIERGE_AI_MOCK,
  gateway: process.env.AI_GATEWAY_API_KEY,
};

function restoreEnv() {
  const assign = (key: string, value: string | undefined) => {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  };
  assign("PREVIEW_DEMO_MODE", saved.demo);
  assign("NODE_ENV", saved.nodeEnv);
  assign("DATABASE_URL", saved.databaseUrl);
  assign("REPL_ID", saved.replId);
  assign("REPLIT_DEPLOYMENT", saved.replitDeployment);
  assign("CONCIERGE_LEAD_EMAIL", saved.lead);
  assign("SENDGRID_API_KEY", saved.sendgrid);
  assign("CONCIERGE_AI_MOCK", saved.mock);
  assign("AI_GATEWAY_API_KEY", saved.gateway);
}

function enableDemo() {
  process.env.PREVIEW_DEMO_MODE = "1";
  process.env.NODE_ENV = "production";
  delete process.env.REPL_ID;
  delete process.env.REPLIT_DEPLOYMENT;
  delete process.env.DATABASE_URL;
  delete process.env.CONCIERGE_LEAD_EMAIL;
  delete process.env.SENDGRID_API_KEY;
  delete process.env.AI_GATEWAY_API_KEY;
  process.env.CONCIERGE_AI_MOCK = "1";
  resetPreviewDemoMemory();
}

afterEach(() => {
  restoreEnv();
});

describe("preview demo guard", () => {
  it("refuses Replit production and production-looking database URLs", () => {
    process.env.PREVIEW_DEMO_MODE = "1";
    process.env.NODE_ENV = "production";
    process.env.REPL_ID = "repl-1";
    delete process.env.DATABASE_URL;
    expect(() => assertPreviewDemoAllowed()).toThrow(/NODE_ENV=production on Replit/);

    delete process.env.REPL_ID;
    process.env.NODE_ENV = "development";
    process.env.DATABASE_URL = "postgresql://user:pass@ep-cool-night.neon.tech/asa";
    expect(() => assertPreviewDemoAllowed()).toThrow(PreviewDemoRefused);
    expect(databaseUrlLooksLikeProd("postgresql://user:pass@db.supabase.co/postgres")).toBe(true);
    expect(databaseUrlLooksLikeProd("postgresql://user:pass@localhost/asa_prod")).toBe(true);
    expect(databaseUrlLooksLikeProd("postgresql://user:pass@127.0.0.1/asa_concierge_local")).toBe(false);
    expect(databaseUrlLooksLikeProd(undefined)).toBe(false);

    delete process.env.DATABASE_URL;
    process.env.NODE_ENV = "production";
    expect(() => assertPreviewDemoAllowed()).not.toThrow();

    delete process.env.PREVIEW_DEMO_MODE;
    process.env.DATABASE_URL = "postgresql://user:pass@ep-cool-night.neon.tech/asa";
    expect(() => assertPreviewDemoAllowed()).not.toThrow();
  });

  it("does not change the Replit build or start scripts", () => {
    const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
    expect(pkg.scripts.build).toBe(
      "vite build && esbuild server/index.ts --platform=node --packages=external --bundle --format=esm --outdir=dist --define:process.env.NODE_ENV=\\\"production\\\"",
    );
    expect(pkg.scripts.start).toBe("NODE_ENV=production node dist/index.js");
    const vercel = JSON.parse(readFileSync(resolve(root, "vercel.json"), "utf8"));
    expect(vercel.buildCommand).toBe("VITE_PREVIEW_DEMO_MODE=1 npx vite build");
    expect(vercel.outputDirectory).toBe("dist/public");
    expect(vercel.framework).toBeNull();
  });

  it("keeps the Vercel entry off Supabase and the Replit server", () => {
    const entry = readFileSync(resolve(root, "api/index.ts"), "utf8");
    const app = readFileSync(resolve(root, "server/preview/express-app.ts"), "utf8");
    for (const source of [entry, app]) {
      expect(source).not.toMatch(/from ["'].*supabase-auth|from ["']@supabase\/supabase-js|from ["'].*server\/index/);
    }
    expect(entry).toContain("requirePreviewDemo");
    const index = readFileSync(resolve(root, "server/index.ts"), "utf8");
    expect(index).toContain("assertPreviewDemoAllowed");
  });
});

describe("preview demo concierge", () => {
  it("answers anonymously, scopes a fake parent, logs leads, and keeps analytics in memory", async () => {
    enableDemo();
    const app = createPreviewExpressApp();

    const anon = await request(app)
      .post("/api/concierge/chat")
      .send({ messages: [{ role: "user", content: "How do I enroll without a school code?" }] });
    expect(anon.status).toBe(200);
    expect(anon.body.reply).toContain("registration code");
    expect(anon.body.reply).not.toContain("Rowan");

    const avery = await request(app)
      .post("/api/concierge/chat")
      .set("x-preview-demo-parent", "avery")
      .send({
        messages: [{
          role: "user",
          content: `tool:get_my_family {"childId":${PREVIEW_DEMO_IDS.skyler}}`,
        }],
      });
    expect(avery.status).toBe(200);
    expect(avery.body.reply).toContain("Rowan");
    expect(avery.body.reply).toContain("Quinn");
    expect(avery.body.reply).not.toContain("Skyler");

    const blake = await request(app)
      .post("/api/concierge/chat")
      .set("x-preview-demo-parent", "blake")
      .send({ messages: [{ role: "user", content: "tool:get_my_family {}" }] });
    expect(blake.body.reply).toContain("Skyler");
    expect(blake.body.reply).not.toContain("Rowan");

    const week = await request(app)
      .post("/api/concierge/chat")
      .set("x-preview-demo-parent", "avery")
      .send({ messages: [{ role: "user", content: "tool:get_week_materials {}" }] });
    expect(week.body.reply).toContain("Leaf rubbings");
    expect(week.body.reply).not.toContain("Secret draft");
    expect(week.body.reply).not.toContain("Color wheel");

    const paid = await request(app)
      .post("/api/concierge/chat")
      .set("x-preview-demo-parent", "avery")
      .send({
        messages: [{
          role: "user",
          content: `tool:rsvp_event {"eventProductId":${PREVIEW_DEMO_IDS.paidEvent},"attendees":[{"type":"adult","quantity":1}],"meals":[],"otherNote":null}`,
        }],
      });
    expect(paid.body.reply.toLowerCase()).toContain("price");
    expect(paid.body.handoff).toBe(true);

    const free = await request(app)
      .post("/api/concierge/chat")
      .set("x-preview-demo-parent", "avery")
      .send({
        messages: [{
          role: "user",
          content: `tool:rsvp_event {"eventProductId":${PREVIEW_DEMO_IDS.freeEvent},"attendees":[{"type":"adult","quantity":1}],"meals":[],"otherNote":null}`,
        }],
      });
    expect(free.status).toBe(200);
    expect(free.body.reply).toContain("Lakeside picnic");
    expect(free.body.handoff).toBe(false);

    const inquiry = await request(app)
      .post("/api/concierge/chat")
      .send({
        messages: [{
          role: "user",
          content: 'tool:start_enrollment_inquiry {"question":"What time does the co-op meet?","contactName":"Pat Demo","contactEmail":"pat.demo@example.invalid"}',
        }],
      });
    expect(inquiry.body.reply.toLowerCase()).toContain("logged");
    expect(inquiry.body.reply.toLowerCase()).not.toContain("skyler");
    const leads = previewDemoLeads();
    expect(leads.some((lead) => lead.contactEmail === "pat.demo@example.invalid" && lead.sent === false)).toBe(true);

    const sensitive = await request(app)
      .post("/api/concierge/chat")
      .set("x-preview-demo-parent", "avery")
      .send({ messages: [{ role: "user", content: "Rowan has a peanut allergy" }] });
    expect(sensitive.body.handoff).toBe(true);
    const stored = JSON.stringify(previewDemoAnalytics());
    expect(stored).not.toContain("peanut");
    expect(stored).not.toContain("allergy");
    expect(previewDemoAnalytics().some((row) => row.eventType === "concierge_turn")).toBe(true);
  });

  it("signs in as the fake parent with a cookie and does not accept an unknown parent", async () => {
    enableDemo();
    const app = createPreviewExpressApp();
    const agent = request.agent(app);
    const denied = await agent.post("/api/preview-demo/sign-in").send({ parentKey: "morgan" });
    expect(denied.status).toBe(400);
    const signed = await agent.post("/api/preview-demo/sign-in").send({ parentKey: "avery" });
    expect(signed.status).toBe(200);
    expect(signed.body.parent.email).toBe("avery.quinn@example.invalid");
    const session = await agent.get("/api/preview-demo/session");
    expect(session.body.signedIn).toBe(true);
    const chat = await agent.post("/api/concierge/chat").send({
      messages: [{ role: "user", content: "tool:get_my_family {}" }],
    });
    expect(chat.body.reply).toContain("Rowan");
    expect(chat.body.reply).not.toContain("Skyler");
  });
});
