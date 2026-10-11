import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "@jest/globals";
import request from "supertest";
import {
  assertPreviewDemoAllowed,
  CONCIERGE_PREVIEW_PROJECT_ID,
  CONCIERGE_PREVIEW_PRODUCTION_HOST,
  DEMO_BLOCKED_ENV,
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
  vercel: process.env.VERCEL,
  vercelEnv: process.env.VERCEL_ENV,
  vercelProjectId: process.env.VERCEL_PROJECT_ID,
  vercelProductionUrl: process.env.VERCEL_PROJECT_PRODUCTION_URL,
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseServiceRole: process.env.SUPABASE_SERVICE_ROLE_KEY,
  viteSupabaseUrl: process.env.VITE_SUPABASE_URL,
  viteSupabaseAnon: process.env.VITE_SUPABASE_ANON_KEY,
  replId: process.env.REPL_ID,
  replOwner: process.env.REPL_OWNER,
  replSlug: process.env.REPL_SLUG,
  replitDeployment: process.env.REPLIT_DEPLOYMENT,
  replitDevDomain: process.env.REPLIT_DEV_DOMAIN,
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
  assign("VERCEL", saved.vercel);
  assign("VERCEL_ENV", saved.vercelEnv);
  assign("VERCEL_PROJECT_ID", saved.vercelProjectId);
  assign("VERCEL_PROJECT_PRODUCTION_URL", saved.vercelProductionUrl);
  assign("SUPABASE_URL", saved.supabaseUrl);
  assign("SUPABASE_SERVICE_ROLE_KEY", saved.supabaseServiceRole);
  assign("VITE_SUPABASE_URL", saved.viteSupabaseUrl);
  assign("VITE_SUPABASE_ANON_KEY", saved.viteSupabaseAnon);
  assign("REPL_ID", saved.replId);
  assign("REPL_OWNER", saved.replOwner);
  assign("REPL_SLUG", saved.replSlug);
  assign("REPLIT_DEPLOYMENT", saved.replitDeployment);
  assign("REPLIT_DEV_DOMAIN", saved.replitDevDomain);
  assign("CONCIERGE_LEAD_EMAIL", saved.lead);
  assign("SENDGRID_API_KEY", saved.sendgrid);
  assign("CONCIERGE_AI_MOCK", saved.mock);
  assign("AI_GATEWAY_API_KEY", saved.gateway);
}

function clearReplitEnv() {
  delete process.env.REPL_ID;
  delete process.env.REPL_OWNER;
  delete process.env.REPL_SLUG;
  delete process.env.REPLIT_DEPLOYMENT;
  delete process.env.REPLIT_DEV_DOMAIN;
}

function clearDemoBlockedEnv() {
  for (const name of DEMO_BLOCKED_ENV) delete process.env[name];
}

function enableDemo() {
  process.env.PREVIEW_DEMO_MODE = "1";
  process.env.VERCEL = "1";
  process.env.VERCEL_ENV = "production";
  process.env.VERCEL_PROJECT_ID = CONCIERGE_PREVIEW_PROJECT_ID;
  delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
  process.env.NODE_ENV = "production";
  clearReplitEnv();
  clearDemoBlockedEnv();
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
  it("requires VERCEL=1 and refuses Replit or any database or Supabase env", () => {
    process.env.PREVIEW_DEMO_MODE = "1";
    process.env.NODE_ENV = "production";
    process.env.VERCEL_ENV = "production";
    process.env.VERCEL_PROJECT_ID = CONCIERGE_PREVIEW_PROJECT_ID;
    delete process.env.VERCEL;
    clearReplitEnv();
    clearDemoBlockedEnv();
    expect(() => assertPreviewDemoAllowed()).toThrow(/VERCEL=1 is required/);

    process.env.VERCEL = "1";
    process.env.REPLIT_DEPLOYMENT = "1";
    expect(() => assertPreviewDemoAllowed()).toThrow(/REPLIT_DEPLOYMENT is set/);

    delete process.env.REPLIT_DEPLOYMENT;
    process.env.NODE_ENV = "development";
    process.env.REPL_ID = "repl-1";
    expect(() => assertPreviewDemoAllowed()).toThrow(/REPL_ID/);

    delete process.env.REPL_ID;
    process.env.REPL_OWNER = "owner";
    expect(() => assertPreviewDemoAllowed()).toThrow(/REPL_OWNER/);
    delete process.env.REPL_OWNER;
    process.env.REPL_SLUG = "asa";
    expect(() => assertPreviewDemoAllowed()).toThrow(/REPL_SLUG/);
    delete process.env.REPL_SLUG;
    process.env.REPLIT_DEV_DOMAIN = "abc.replit.dev";
    expect(() => assertPreviewDemoAllowed()).toThrow(/REPLIT_DEV_DOMAIN/);

    clearReplitEnv();
    process.env.VERCEL_ENV = "preview";
    delete process.env.VERCEL_PROJECT_ID;
    for (const name of DEMO_BLOCKED_ENV) {
      clearDemoBlockedEnv();
      process.env[name] = name === "DATABASE_URL"
        ? "postgresql://user:pass@127.0.0.1:5432/asa_concierge_local"
        : "present";
      expect(() => assertPreviewDemoAllowed()).toThrow(new RegExp(`${name} is set`));
    }

    clearDemoBlockedEnv();
    process.env.VERCEL_ENV = "production";
    delete process.env.VERCEL_PROJECT_ID;
    delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
    expect(() => assertPreviewDemoAllowed()).toThrow(/concierge preview project/);

    process.env.VERCEL_PROJECT_ID = "prj_someone_else";
    process.env.VERCEL_PROJECT_PRODUCTION_URL = "other-app.vercel.app";
    expect(() => assertPreviewDemoAllowed()).toThrow(/concierge preview project/);

    process.env.VERCEL_PROJECT_ID = CONCIERGE_PREVIEW_PROJECT_ID;
    delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
    expect(() => assertPreviewDemoAllowed()).not.toThrow();

    delete process.env.VERCEL_PROJECT_ID;
    process.env.VERCEL_PROJECT_PRODUCTION_URL = CONCIERGE_PREVIEW_PRODUCTION_HOST;
    expect(() => assertPreviewDemoAllowed()).not.toThrow();

    process.env.VERCEL_ENV = "preview";
    delete process.env.VERCEL_PROJECT_ID;
    delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
    expect(() => assertPreviewDemoAllowed()).not.toThrow();

    delete process.env.PREVIEW_DEMO_MODE;
    process.env.DATABASE_URL = "postgresql://user:pass@127.0.0.1:5432/asa_concierge_local";
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.REPLIT_DEPLOYMENT = "1";
    process.env.VERCEL_ENV = "production";
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

    const familyAnon = await request(app)
      .post("/api/concierge/chat")
      .send({
        messages: [{
          role: "user",
          content: `tool:get_my_family {"childId":${PREVIEW_DEMO_IDS.skyler}}`,
        }],
      });
    expect(familyAnon.status).toBe(200);
    expect(familyAnon.body.toolsUsed).toEqual([]);
    expect(familyAnon.body.reply.toLowerCase()).toContain("sign in");
    expect(familyAnon.body.reply).not.toContain("Rowan");
    expect(familyAnon.body.reply).not.toContain("Skyler");

    const refusedChild = await request(app)
      .post("/api/concierge/chat")
      .set("x-preview-demo-parent", "avery")
      .send({
        messages: [{
          role: "user",
          content: `tool:get_my_family {"childId":${PREVIEW_DEMO_IDS.skyler}}`,
        }],
      });
    expect(refusedChild.status).toBe(200);
    expect(refusedChild.body.reply).toContain("not in your family");
    expect(refusedChild.body.reply).not.toContain("Skyler");
    expect(refusedChild.body.reply).not.toContain("Rowan");

    const avery = await request(app)
      .post("/api/concierge/chat")
      .set("x-preview-demo-parent", "avery")
      .send({ messages: [{ role: "user", content: "tool:get_my_family {}" }] });
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

    const foreignWeek = await request(app)
      .post("/api/concierge/chat")
      .set("x-preview-demo-parent", "avery")
      .send({
        messages: [{
          role: "user",
          content: `tool:get_week_materials {"childId":${PREVIEW_DEMO_IDS.skyler}}`,
        }],
      });
    expect(foreignWeek.body.reply).toContain("not in your family");
    expect(foreignWeek.body.reply).not.toContain("Leaf rubbings");
    expect(foreignWeek.body.reply).not.toContain("Skyler");

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

    const otherSchoolEvent = await request(app)
      .post("/api/concierge/chat")
      .set("x-preview-demo-parent", "avery")
      .send({
        messages: [{
          role: "user",
          content: 'tool:rsvp_event {"eventProductId":99,"attendees":[{"type":"adult","quantity":1}],"meals":[],"otherNote":null}',
        }],
      });
    expect(otherSchoolEvent.body.reply).toBe("Event not found.");
    expect(otherSchoolEvent.body.reply).not.toContain("Harvest supper");

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
    const setCookie = String(signed.headers["set-cookie"]);
    expect(setCookie).toContain("asa_preview_parent=");
    expect(setCookie).not.toContain("Secure");
    const httpsCookie = await request(app)
      .post("/api/preview-demo/sign-in")
      .set("x-forwarded-proto", "https")
      .send({ parentKey: "avery" });
    expect(String(httpsCookie.headers["set-cookie"])).toContain("Secure");
    const session = await agent.get("/api/preview-demo/session");
    expect(session.body.signedIn).toBe(true);
    const chat = await agent.post("/api/concierge/chat").send({
      messages: [{ role: "user", content: "tool:get_my_family {}" }],
    });
    expect(chat.body.reply).toContain("Rowan");
    expect(chat.body.reply).not.toContain("Skyler");
  });
});

describe("main Express server", () => {
  it("ignores the demo cookie when demo mode is off", async () => {
    delete process.env.PREVIEW_DEMO_MODE;
    process.env.CONCIERGE_AI_MOCK = "1";
    delete process.env.AI_GATEWAY_API_KEY;
    const { default: app } = await import("../index");
    const response = await request(app)
      .post("/api/concierge/chat")
      .set("Cookie", "asa_preview_parent=2")
      .set("x-preview-demo-parent", "avery")
      .send({ messages: [{ role: "user", content: "tool:get_my_family {}" }] });
    expect(response.status).toBe(200);
    expect(response.body.toolsUsed).toEqual([]);
    expect(response.body.reply.toLowerCase()).toContain("sign in");
    expect(response.body.reply).not.toContain("Rowan");
    expect(response.body.reply).not.toContain("Avery");
    expect(response.body.reply).not.toContain("Quinn");
  });
});

describe("public route allowlist", () => {
  it("keeps /concierge on the same public lists #149 uses, and not the signed-in parent path", () => {
    const appTsx = readFileSync(resolve(root, "client/src/App.tsx"), "utf8");
    const queryClient = readFileSync(resolve(root, "client/src/lib/queryClient.ts"), "utf8");
    const appBlock = appTsx.slice(
      appTsx.indexOf("const onAuthOrPublicPath"),
      appTsx.indexOf("Redirecting unauthenticated"),
    );
    expect(appBlock).toContain("pathname.startsWith('/fundraiser/')");
    expect(appBlock).toContain("pathname === '/concierge'");
    expect(appBlock).not.toContain("/parent/concierge");

    const queryBlock = queryClient.slice(
      queryClient.indexOf("const isOnPublicPath"),
      queryClient.indexOf("if (!isOnPublicPath)"),
    );
    expect(queryBlock).toContain("currentPath.startsWith('/fundraiser/')");
    expect(queryBlock).toContain("currentPath === '/concierge'");
    expect(queryBlock).not.toContain("/parent/concierge");
  });
});
