import { test, expect } from "@playwright/test";
import { postSetupPublicFormScenario } from "./helpers/testSeed";
import { requireLinkedSeed } from "./helpers/requireLinkedSeed";
import {
  dismissStaffGuideIfVisible,
  loginParent,
  preventStaffGuideModal,
} from "./helpers/parentCheckoutHelpers";

/**
 * Logged-in members get profile auto-fill on any Form Builder form
 * (public included) via label/type heuristics. Guests stay blank.
 */
test.describe.configure({ mode: "serial", timeout: 120_000 });

test.describe("member form auto-fill", () => {
  test("guest public form leaves name and email empty", async ({ page, request }) => {
    const { response, json } = await postSetupPublicFormScenario(request, {
      linkSupabaseAuthParent: true,
    });
    const seed = requireLinkedSeed(response, json, {
      linked: json?.data?.parentSupabaseLinked === true,
      need: "Supabase parent",
    });

    await page.goto(`/forms/${seed.publicForm.slug}`, {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByTestId("text-form-title")).toBeVisible({ timeout: 20_000 });

    await expect(
      page.getByTestId(`input-field-${seed.publicForm.fieldIds.fullName}`),
    ).toHaveValue("");
    await expect(
      page.getByTestId(`input-field-${seed.publicForm.fieldIds.email}`),
    ).toHaveValue("");
  });

  test("logged-in parent sees full name and email filled", async ({ page, request }) => {
    const { response, json } = await postSetupPublicFormScenario(request, {
      linkSupabaseAuthParent: true,
    });
    const seed = requireLinkedSeed(response, json, {
      linked: json?.data?.parentSupabaseLinked === true,
      need: "Supabase parent",
    });

    await preventStaffGuideModal(page);
    await loginParent(page, seed.parent.email, seed.parent.password);
    await dismissStaffGuideIfVisible(page);

    await page.goto(`/forms/${seed.publicForm.slug}`, {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByTestId("text-form-title")).toBeVisible({ timeout: 30_000 });

    await expect(
      page.getByTestId(`input-field-${seed.publicForm.fieldIds.fullName}`),
    ).toHaveValue(`${seed.parent.firstName} ${seed.parent.lastName}`, { timeout: 15_000 });
    await expect(
      page.getByTestId(`input-field-${seed.publicForm.fieldIds.email}`),
    ).toHaveValue(seed.parent.email);
  });
});
