import { test, expect } from "@playwright/test";

test.describe("app smoke", () => {
  test("GET / returns HTML shell with root mount", async ({ request }) => {
    const res = await request.get("/");
    expect(res.ok(), `expected 200, got ${res.status()}`).toBeTruthy();
    const html = await res.text();
    expect(html).toContain('id="root"');
  });

  test("POST /api/cart/snapshot returns JSON (not SPA HTML) when unauthenticated", async ({
    request,
  }) => {
    const res = await request.post("/api/cart/snapshot", {
      data: { items: [], creditsToApply: 0 },
      headers: { "Content-Type": "application/json" },
    });
    const ct = (res.headers()["content-type"] ?? "").toLowerCase();
    expect(ct, `expected JSON content-type, got ${ct}`).toMatch(/application\/json/);
    const body = await res.json();
    expect(body).toBeTruthy();
    expect(typeof body).toBe("object");
    expect(res.status()).toBe(401);
  });
});
