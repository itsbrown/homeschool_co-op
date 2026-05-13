import { test, expect } from "@playwright/test";
import {
  expectNoKnownParentLoadFailures,
  gotoAndWaitForSuccessfulGets,
} from "../helpers/parentShellApi";

/**
 * Authenticated parent shell: assert primary GET APIs succeed per route.
 * Runs only in project `chromium-authenticated` when E2E_PARENT_EMAIL +
 * E2E_PARENT_PASSWORD are set (see playwright.config.ts + docs/E2E_PARENT_PROFILE.md).
 */
test.describe.configure({ mode: "serial" });

const cases: { name: string; path: string; apis: string[]; expectText: RegExp }[] = [
  { name: "dashboard", path: "/dashboard", apis: ["/api/parent/children"], expectText: /Parent Dashboard/i },
  { name: "parent home", path: "/parent/home", apis: ["/api/parent/children"], expectText: /Parent Dashboard/i },
  { name: "children", path: "/children", apis: ["/api/parent/children"], expectText: /^Children$/i },
  {
    name: "payments",
    path: "/payments",
    apis: ["/api/payment-history/history", "/api/enrollments"],
    expectText: /^Payments$/i,
  },
  {
    name: "payment methods",
    path: "/payment-methods",
    apis: ["/api/user/payment-methods", "/api/user/auto-pay-status"],
    expectText: /^Payment Methods$/i,
  },
  {
    name: "programs",
    path: "/parent/programs",
    apis: ["/api/parent/children", "/api/parent/classes", "/api/classes/categories/names"],
    expectText: /Classes & Programs/i,
  },
  {
    name: "weekly schedule",
    path: "/parent/weekly-schedule",
    apis: ["/api/schedule-builder/week-plans/published"],
    expectText: /Weekly Schedule/i,
  },
  {
    name: "documents",
    path: "/parent/documents",
    apis: [
      "/api/parent/documents",
      "/api/parent/school-documents",
      "/api/parent/payment-receipts",
    ],
    expectText: /My Documents/i,
  },
  {
    name: "assessments",
    path: "/parent/assessments",
    apis: ["/api/assessments/parent/my-children"],
    expectText: /Reading Assessments/i,
  },
  {
    name: "notifications",
    path: "/notifications",
    apis: ["/api/notifications"],
    expectText: /^Notifications$/i,
  },
  { name: "settings", path: "/settings", apis: ["/api/users/profile"], expectText: /^Settings$/i },
  {
    name: "concierge",
    path: "/parent/concierge",
    apis: ["/api/parent-concierge/context"],
    expectText: /ASA Assistant/i,
  },
  {
    name: "billing",
    path: "/billing",
    apis: ["/api/billing/summary"],
    expectText: /^Payments$/i,
  },
];

for (const c of cases) {
  test(`${c.name}: GET APIs OK and shell renders (${c.path})`, async ({ page }) => {
    await gotoAndWaitForSuccessfulGets(page, c.path, c.apis);
    await expectNoKnownParentLoadFailures(page);
    await expect(page.getByRole("heading", { name: c.expectText }).first()).toBeVisible({
      timeout: 20_000,
    });
  });
}
