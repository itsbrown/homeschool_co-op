import { test, expect } from "@playwright/test";
import {
  dismissStaffGuideIfVisible,
  loginParent,
  preventStaffGuideModal,
} from "./helpers/parentCheckoutHelpers";
import { requireLinkedSeed } from "./helpers/requireLinkedSeed";
import { postSetupGradePlacementScenario } from "./helpers/testSeed";

test.describe.configure({ mode: "serial", timeout: 90_000 });

test.describe("grade placement auto-place", () => {
  test("roster shows paid match with Placed by grade; Place only is on Edit Class", async ({
    page,
    request,
  }) => {
    const { response, json } = await postSetupGradePlacementScenario(request, {
      linkSupabaseAuth: true,
    });
    const seed = requireLinkedSeed(response, json, {
      linked: json?.data?.adminSupabaseLinked === true,
      need: "Supabase auth for school admin",
    });

    await preventStaffGuideModal(page);
    await loginParent(page, seed.admin.email, seed.admin.password);
    await dismissStaffGuideIfVisible(page);

    await page.goto(`/schools/classes/${seed.class.id}/roster`, {
      waitUntil: "domcontentloaded",
    });
    const paidName = `${seed.children.paid.firstName} ${seed.children.paid.lastName}`;
    await expect(page.getByText(paidName, { exact: true })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByTestId("badge-placed-by-grade").first()).toBeVisible();
    await expect(
      page.getByText(
        `${seed.children.unpaid.firstName} ${seed.children.unpaid.lastName}`,
        { exact: true },
      ),
    ).toHaveCount(0);

    await page.goto(`/schools/classes/${seed.class.id}/edit`, {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByTestId("select-class-session")).toContainText(/Fall 2026/i, {
      timeout: 30_000,
    });

    const autoPlace = page.getByTestId("switch-auto-place-by-grade");
    await expect(autoPlace).toBeVisible({ timeout: 30_000 });
    await autoPlace.scrollIntoViewIfNeeded();
    await expect(autoPlace).toBeEnabled({ timeout: 15_000 });
    if ((await autoPlace.getAttribute("data-state")) !== "checked") {
      await autoPlace.click();
    }

    const placeOnly = page.getByTestId("select-auto-place-day-type");
    await expect(placeOnly).toBeVisible();
    await expect(placeOnly).toBeEnabled();
    await placeOnly.scrollIntoViewIfNeeded();
    await placeOnly.click();
    await page.getByRole("option", { name: "Full day only" }).click();
    await expect(placeOnly).toContainText(/Full day only/i);

    const preview = page.getByTestId("text-placement-preview");
    await expect(preview).toBeVisible({ timeout: 45_000 });
    await expect(preview).toContainText(/blocked|unpaid|placed/i);
  });
});
