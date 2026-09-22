import { test, expect, type Page } from "@playwright/test";
import {
  dismissStaffGuideIfVisible,
  loginParent,
  preventStaffGuideModal,
} from "./helpers/parentCheckoutHelpers";
import {
  postSetupScheduleScenario,
  type SetupScheduleBuilderScenarioResponse,
} from "./helpers/testSeed";
import { requireLinkedSeed } from "./helpers/requireLinkedSeed";

test.describe.configure({ mode: "serial", timeout: 120_000 });

type Seed = NonNullable<SetupScheduleBuilderScenarioResponse["data"]>;

let seed: Seed;

test.beforeAll(async ({ request }) => {
  test.setTimeout(180_000);
  const { response, json } = await postSetupScheduleScenario(request, {
    linkSupabaseAuth: true,
    sameDayBothChildren: true,
    extraMondayBlocks: 12,
  });
  seed = requireLinkedSeed(response, json);
  if (!seed.blocks.yankeeMonday || (seed.blocks.extraMonday?.length ?? 0) < 12) {
    throw new Error("day-sheet seed did not return both-children Monday blocks");
  }
});

function addDays(iso: string, days: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

async function openSchedule(page: Page) {
  await preventStaffGuideModal(page);
  await loginParent(page, seed.parent.email, seed.parent.password);
  await dismissStaffGuideIfVisible(page);
  await page.goto("/schedule", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("text-current-month")).toBeVisible({ timeout: 30_000 });
}

async function ensureDay(page: Page, iso: string) {
  const target = new Date(`${iso}T12:00:00`);
  const day = page.getByTestId(`calendar-day-${iso}`);
  for (let i = 0; i < 3 && (await day.count()) === 0; i++) {
    const label = (await page.getByTestId("text-current-month").innerText()).trim();
    const shown = new Date(`${label} 1`);
    const shownIndex = shown.getFullYear() * 12 + shown.getMonth();
    const targetIndex = target.getFullYear() * 12 + target.getMonth();
    if (targetIndex > shownIndex) {
      await page.getByTestId("button-next-month").click();
    } else {
      await page.getByTestId("button-prev-month").click();
    }
  }
  await expect(day).toBeVisible();
}

async function openMonday(page: Page) {
  await ensureDay(page, seed.weekStart);
  await page.getByTestId(`calendar-day-${seed.weekStart}`).click();
  await expect(page.getByTestId("family-day-sheet")).toBeVisible({ timeout: 30_000 });
}

async function showChild(page: Page, childId: number) {
  const chip = page.getByTestId(`day-lessons-child-${childId}`);
  if ((await chip.count()) > 0) {
    await chip.click();
  }
}

test.describe("parent family schedule day sheet", () => {
  test("long day scrolls inside the sheet and keeps the header pinned", async ({ page }) => {
    await openSchedule(page);
    await openMonday(page);
    await showChild(page, seed.children.seekers.id);

    const list = page.getByTestId("day-lessons-list");
    const header = page.getByTestId("day-lessons-header");
    const last = seed.blocks.extraMonday![seed.blocks.extraMonday!.length - 1];
    const lastRow = page.getByTestId(`day-lessons-row-${last.blockId}`);
    await expect(lastRow).toBeAttached();
    const pageScrollBefore = await page.evaluate(() => document.scrollingElement?.scrollTop ?? 0);
    await list.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    await expect.poll(async () => list.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
    const pageScrollAfter = await page.evaluate(() => document.scrollingElement?.scrollTop ?? 0);
    expect(pageScrollAfter).toBe(pageScrollBefore);

    const row = page.getByTestId(`day-lessons-row-${last.blockId}`);
    const rowBox = await row.boundingBox();
    const listBox = await list.boundingBox();
    expect(rowBox).toBeTruthy();
    expect(listBox).toBeTruthy();
    expect(rowBox!.y).toBeGreaterThanOrEqual(listBox!.y - 1);
    expect(rowBox!.y).toBeLessThan(listBox!.y + listBox!.height);

    const headerBox = await header.boundingBox();
    const viewport = page.viewportSize();
    expect(headerBox).toBeTruthy();
    expect(headerBox!.y).toBeGreaterThanOrEqual(0);
    expect(headerBox!.y + headerBox!.height).toBeLessThanOrEqual((viewport?.height ?? 720) + 1);

    const pageScroll = await page.evaluate(() => document.scrollingElement?.scrollTop ?? 0);
    expect(pageScroll).toBe(pageScrollBefore);
  });

  test("chips switch children and the class title stays on the section", async ({ page }) => {
    await openSchedule(page);
    await openMonday(page);

    const seekersRow = page.getByRole("button", { name: seed.blocks.seekersTitle, exact: true });
    const yankeeRow = page.getByRole("button", { name: seed.blocks.yankeeMonday!.title, exact: true });
    await expect(page.getByTestId(`day-lessons-child-${seed.children.seekers.id}`)).toBeVisible();
    await page.getByTestId(`day-lessons-child-${seed.children.seekers.id}`).click();
    await expect(seekersRow).toBeVisible();
    await expect(yankeeRow).toHaveCount(0);
    await expect(page.getByTestId("day-lessons-list")).toContainText(seed.classes.seekers.title);
    await expect(seekersRow).not.toContainText(seed.classes.seekers.title);

    await page.getByTestId(`day-lessons-child-${seed.children.yankee.id}`).click();
    await expect(yankeeRow).toBeVisible();
    await expect(seekersRow).toHaveCount(0);
    await expect(page.getByTestId("day-lessons-list")).toContainText(seed.classes.yankee.title);
    await expect(yankeeRow).not.toContainText(seed.classes.yankee.title);
  });

  test("child filter opens one child without chips", async ({ page }) => {
    await openSchedule(page);
    await page.getByTestId("select-child-filter").click();
    await page
      .getByRole("option", {
        name: `${seed.children.seekers.firstName} ${seed.children.seekers.lastName}`,
      })
      .click();
    await openMonday(page);
    await expect(page.locator("[data-testid^='day-lessons-child-']")).toHaveCount(0);
    await expect(page.getByRole("button", { name: seed.blocks.seekersTitle, exact: true })).toBeVisible();
    await expect(page.getByText(seed.blocks.yankeeMonday!.title)).toHaveCount(0);
  });

  test("lesson row opens detail and back returns to that row", async ({ page }) => {
    await openSchedule(page);
    await openMonday(page);
    await showChild(page, seed.children.seekers.id);
    const row = page.getByRole("button", { name: seed.blocks.seekersTitle, exact: true });
    await row.click();
    await expect(page.getByTestId("schedule-block-description")).toContainText("Outdoor observation");
    await page.getByTestId("day-lessons-back").click();
    await expect(row).toBeVisible();
  });

  test("a day with no lessons does not open the sheet", async ({ page }) => {
    await openSchedule(page);
    const today = new Date();
    const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    const emptyIso = [4, 5, 6].map((offset) => addDays(seed.weekStart, offset)).find((iso) => iso !== todayIso)!;
    await ensureDay(page, emptyIso);
    const plans = page.waitForResponse(
      (response) =>
        response.request().method() === "GET" &&
        response.url().includes("/api/schedule-builder/parent/my-week-plans") &&
        response.ok(),
      { timeout: 30_000 },
    );
    await page.getByTestId(`calendar-day-${emptyIso}`).click();
    await plans;
    await expect(page.getByTestId("family-day-sheet")).toHaveCount(0);
  });

  test("draft lessons stay out of the Monday sheet", async ({ page }) => {
    await openSchedule(page);
    await openMonday(page);
    for (const child of [seed.children.seekers, seed.children.yankee]) {
      await showChild(page, child.id);
      await expect(page.getByTestId("day-lessons-list")).not.toContainText("Draft: Pending Publish");
    }
  });

  test("close button and Escape dismiss the sheet", async ({ page }) => {
    await openSchedule(page);
    await openMonday(page);
    await page.getByTestId("family-day-sheet").getByRole("button", { name: "Close" }).click();
    await expect(page.getByTestId("family-day-sheet")).toHaveCount(0);
    await expect(page.getByTestId("text-current-month")).toBeVisible();

    await openMonday(page);
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("family-day-sheet")).toHaveCount(0);
    await expect(page.getByTestId("text-current-month")).toBeVisible();
  });

  test.describe("phone", () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test("sheet sits on the bottom, rows are 44px, and the list scrolls", async ({ page }) => {
      await openSchedule(page);
      await openMonday(page);
      await showChild(page, seed.children.seekers.id);

      const sheetBox = await page.getByTestId("family-day-sheet").boundingBox();
      expect(sheetBox).toBeTruthy();
      expect(Math.abs(sheetBox!.y + sheetBox!.height - 844)).toBeLessThan(8);

      const rowBox = await page
        .getByRole("button", { name: seed.blocks.seekersTitle, exact: true })
        .boundingBox();
      expect(rowBox).toBeTruthy();
      expect(rowBox!.height).toBeGreaterThanOrEqual(44);

      const list = page.getByTestId("day-lessons-list");
      const last = seed.blocks.extraMonday![seed.blocks.extraMonday!.length - 1];
      await expect(page.getByTestId(`day-lessons-row-${last.blockId}`)).toBeAttached();
      await list.evaluate((el) => {
        el.scrollTop = el.scrollHeight;
      });
      await expect.poll(async () => list.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
      const lastRow = page.getByTestId(`day-lessons-row-${last.blockId}`);
      const rowBoxAfter = await lastRow.boundingBox();
      const listBox = await list.boundingBox();
      expect(rowBoxAfter).toBeTruthy();
      expect(listBox).toBeTruthy();
      expect(rowBoxAfter!.y).toBeGreaterThanOrEqual(listBox!.y - 1);
      expect(rowBoxAfter!.y).toBeLessThan(listBox!.y + listBox!.height);
    });
  });
});
