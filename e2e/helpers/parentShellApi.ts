import { expect, type Page } from "@playwright/test";

/**
 * Navigate to a parent-shell route and wait for one or more GET /api/* responses
 * to complete successfully. Starts listeners before `goto` so fast responses
 * are not missed.
 */
export async function gotoAndWaitForSuccessfulGets(
  page: Page,
  path: string,
  urlSubstrings: string[],
  options?: { timeoutMs?: number },
): Promise<void> {
  const timeoutMs = options?.timeoutMs ?? 60_000;
  const waiters = urlSubstrings.map((sub) =>
    page.waitForResponse(
      (r) =>
        r.request().method() === "GET" &&
        r.url().includes(sub) &&
        !r.url().includes("/api/test"),
      { timeout: timeoutMs },
    ),
  );
  await Promise.all([page.goto(path, { waitUntil: "domcontentloaded" }), ...waiters]);
  for (const w of waiters) {
    const res = await w;
    expect(res.ok(), `GET ${res.url()} returned ${res.status()} for ${path}`).toBeTruthy();
  }
  await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 });
}

/** Guardrails for known fatal parent-shell error copy. */
export async function expectNoKnownParentLoadFailures(page: Page): Promise<void> {
  await expect(page.getByRole("heading", { name: /^Access Denied$/ })).toHaveCount(0);
  await expect(page.getByText("Could not load children")).toHaveCount(0);
}
