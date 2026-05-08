import express from "express";
import request from "supertest";
import stripeWebhookRouter from "../../api/stripe-webhook";

describe("Stripe webhook route hardening", () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  function createApp() {
    const app = express();
    app.use(express.json());
    app.use("/api/stripe-webhooks", stripeWebhookRouter);
    return app;
  }

  it("blocks legacy membership route in production", async () => {
    process.env.NODE_ENV = "production";
    const app = createApp();

    const res = await request(app)
      .post("/api/stripe-webhooks/membership")
      .send({ type: "invoice.paid", data: { object: {} } });

    expect(res.status).toBe(410);
    expect(res.body.error).toBe("Endpoint disabled");
  });

  it("allows legacy membership route in non-production", async () => {
    process.env.NODE_ENV = "test";
    const app = createApp();

    const res = await request(app)
      .post("/api/stripe-webhooks/membership")
      .send({ type: "test.event.unhandled", data: { object: {} } });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });
});
