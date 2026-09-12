import { test, expect } from "@playwright/test";
import { loginSchoolAdmin } from "./helpers/schoolAdminAuth";
import { requireLinkedSeed } from "./helpers/requireLinkedSeed";
import { postSetupEmergencyContactListScenario } from "./helpers/testSeed";

test.describe.configure({ mode: "serial", timeout: 120_000 });

test.describe("school admin emergency contact lists", () => {
  test("whole-school list and one list per class", async ({ page, request }) => {
    const { response, json } = await postSetupEmergencyContactListScenario(request, {
      linkSupabaseAuthAdmin: true,
    });
    const seed = requireLinkedSeed(response, json, {
      linked: json?.data?.adminSupabaseLinked === true,
      need: "Supabase admin",
    });

    await loginSchoolAdmin(page, seed.admin.email, seed.admin.password);

    await page.goto("/schools/emergency-contacts", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("table-school-emergency-contacts")).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByTestId("text-emergency-student-count")).toHaveText("2");
    await expect(page.getByTestId("text-emergency-class-count")).toHaveText("2");
    await expect(page.getByTestId(`emergency-contact-row-${seed.childA.id}`)).toContainText(
      seed.contacts.userTable.name,
    );
    await expect(page.getByTestId(`emergency-contact-row-${seed.childA.id}`)).toContainText(
      seed.contacts.userTable.phone,
    );
    await expect(page.getByTestId(`emergency-contact-row-${seed.childB.id}`)).toContainText(
      seed.contacts.extra.name,
    );
    await expect(page.getByTestId("button-export-school-emergency-csv")).toBeEnabled();
    await expect(page.getByTestId("button-print-emergency-contacts")).toBeEnabled();

    await page.getByTestId("tab-emergency-classes").click();
    await expect(page.getByTestId(`card-class-emergency-${seed.classA.id}`)).toBeVisible();
    await expect(page.getByTestId(`card-class-emergency-${seed.classB.id}`)).toBeVisible();
    await expect(page.getByTestId(`table-class-emergency-${seed.classA.id}`)).toContainText(
      seed.childA.firstName,
    );
    await expect(page.getByTestId(`table-class-emergency-${seed.classB.id}`)).toContainText(
      seed.childB.firstName,
    );

    await page.goto(`/schools/classes/${seed.classA.id}`, { waitUntil: "domcontentloaded" });
    await page.getByTestId("tab-class-emergency-contacts").click();
    await expect(page.getByTestId("table-class-emergency-contacts")).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByTestId(`emergency-contact-row-${seed.childA.id}`)).toContainText(
      seed.contacts.userTable.phone,
    );
    await expect(page.getByTestId(`emergency-contact-row-${seed.childB.id}`)).toHaveCount(0);
  });
});
