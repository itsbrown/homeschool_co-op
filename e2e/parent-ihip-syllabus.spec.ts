import { test, expect } from "@playwright/test";
import {
  bearerAuthHeaders,
  dismissStaffGuideIfVisible,
  loginParent,
  preventStaffGuideModal,
  waitForSupabaseToken,
} from "./helpers/parentCheckoutHelpers";
import { parsePdfText } from "./helpers/parsePdfText";
import { requireLinkedSeed } from "./helpers/requireLinkedSeed";
import { postSetupScheduleScenario } from "./helpers/testSeed";

/** Page fetch() consumes the response stream; Playwright body() is then empty. */
async function downloadSyllabusPdfText(
  request: import("@playwright/test").APIRequestContext,
  token: string,
  childId: number,
): Promise<string> {
  const res = await request.get(`/api/progress/syllabus/${childId}?format=pdf`, {
    headers: bearerAuthHeaders(token),
  });
  expect(res.ok(), `syllabus PDF ${res.status()}`).toBeTruthy();
  expect(res.headers()["content-type"] || "").toMatch(/application\/pdf/);
  const buf = Buffer.from(await res.body());
  expect(buf.length).toBeGreaterThan(100);
  return parsePdfText(buf);
}

test.describe.configure({ mode: "serial", timeout: 180_000 });

test.describe("parent IHIP syllabus", () => {
  test("parent and staff download a district syllabus PDF", async ({ page, request }) => {
    const { response, json } = await postSetupScheduleScenario(request, { linkSupabaseAuth: true });
    const seed = requireLinkedSeed(response, json);

    await preventStaffGuideModal(page);
    await loginParent(page, seed.parent.email, seed.parent.password);
    await dismissStaffGuideIfVisible(page);
    const parentToken = await waitForSupabaseToken(page);
    const yankee = seed.children.yankee;

    await page.goto("/parent/progress", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /Progress/i })).toBeVisible({ timeout: 30_000 });

    const childTrigger = page.getByRole("combobox").first();
    if (await childTrigger.isVisible().catch(() => false)) {
      await childTrigger.click();
      await page.getByRole("option", { name: /Yankee/i }).click();
    }

    await expect(page.getByTestId("parent-ihip-syllabus-card")).toBeVisible({ timeout: 15_000 });
    const parentPdf = page.waitForResponse(
      (r) =>
        r.request().method() === "GET" &&
        r.url().includes("/api/progress/syllabus/") &&
        r.url().includes("format=pdf") &&
        r.ok(),
      { timeout: 60_000 },
    );
    await page.getByTestId("button-download-ihip-syllabus").click();
    const parentRes = await parentPdf;
    expect(parentRes.headers()["content-type"] || "").toMatch(/application\/pdf/);
    const parentText = await downloadSyllabusPdfText(request, parentToken, yankee.id);
    expect(parentText).toContain("Parent(s)");
    expect(parentText).toMatch(/History/i);
    expect(parentText).toContain("Curriculum / materials");
    expect(parentText).toContain("Plan of instruction / learning objectives");
    expect(parentText).toContain("Yankee: Colonial Life");
    expect(parentText).toContain("Primary source packet");
    expect(parentText).toContain("Describe colonial household work");
    expect(parentText).toMatch(/Reading/);
    expect(parentText).toMatch(/Spelling/);
    expect(parentText).toMatch(/parent complete/i);
    expect(parentText).not.toMatch(/one-liner/);
    expect(parentText).not.toMatch(/American Seekers/i);
    expect(parentText).not.toContain("AMERICAN SEEKERS");

    const signOut = page.getByRole("button", { name: /sign out|log out/i }).first();
    if (await signOut.isVisible().catch(() => false)) {
      await signOut.click();
    } else {
      await page.evaluate(() => {
        localStorage.clear();
        sessionStorage.clear();
      });
      await page.goto("/login", { waitUntil: "domcontentloaded" });
    }
    await expect(page).toHaveURL(/\/login/, { timeout: 30_000 });

    await preventStaffGuideModal(page);
    await loginParent(page, seed.educator.email, seed.educator.password);
    await dismissStaffGuideIfVisible(page);
    const staffToken = await waitForSupabaseToken(page);

    const progressUrl =
      `/educator/assessments?tab=progress&childId=${yankee.id}` +
      `&childName=${encodeURIComponent(`${yankee.firstName} ${yankee.lastName}`)}`;
    await page.goto(progressUrl, { waitUntil: "load" });
    await expect(page.getByTestId("page-title")).toContainText("Student Assessments", { timeout: 30_000 });
    await expect(page.getByTestId("tab-progress")).toHaveAttribute("data-state", "active", { timeout: 15_000 });

    const wizard = page.getByTestId("quarterly-report-wizard");
    await expect(wizard).toBeVisible({ timeout: 30_000 });

    const staffPdf = page.waitForResponse(
      (r) =>
        r.request().method() === "GET" &&
        r.url().includes("/api/progress/syllabus/") &&
        r.url().includes("format=pdf") &&
        r.ok(),
      { timeout: 60_000 },
    );
    await wizard.getByTestId("button-staff-download-ihip-syllabus").click();
    const staffRes = await staffPdf;
    expect(staffRes.headers()["content-type"] || "").toMatch(/application\/pdf/);
    const staffText = await downloadSyllabusPdfText(request, staffToken, yankee.id);
    expect(staffText).toContain("Parent(s)");
    expect(staffText).toMatch(/History/i);
    expect(staffText).toContain("Curriculum / materials");
    expect(staffText).toContain("Yankee: Colonial Life");
    expect(staffText).toContain("Describe colonial household work");
    expect(staffText).not.toMatch(/American Seekers/i);
    expect(staffText).not.toContain("AMERICAN SEEKERS");
  });
});
