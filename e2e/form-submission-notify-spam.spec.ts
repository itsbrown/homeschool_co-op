import { test, expect } from "@playwright/test";
import { postSetupPublicFormScenario, testApiToken } from "./helpers/testSeed";

/**
 * Form submission: persistence, admin/submitter emails, honeypot, duplicates, required fields, rate limit.
 */
test.describe.configure({ mode: "serial", timeout: 120_000 });

async function fetchEmailLog(
  request: import("@playwright/test").APIRequestContext,
  recipient: string,
  type: string,
) {
  const res = await request.get(
    `/api/test/email-log?recipient=${encodeURIComponent(recipient)}&type=${encodeURIComponent(type)}`,
    { headers: { "X-Test-Token": testApiToken() } },
  );
  expect(res.ok(), await res.text()).toBeTruthy();
  const json = await res.json();
  return json.data as Array<{ recipientEmail: string; type: string; status: string }>;
}

test.describe("form submission notify and spam", () => {
  test("submission persists and sends admin + submitter emails", async ({ request }) => {
    const { response, json } = await postSetupPublicFormScenario(request);
    test.skip(!response.ok() || !json?.success || !json.data, "seed failed");
    const seed = json!.data!;
    const form = seed.notifyForm;
    const unique = Date.now();
    const submitterEmail = `submitter_${unique}@example.com`;

    const res = await request.post(`/api/custom-forms/forms/${form.id}/submit`, {
      data: {
        responseData: {
          [`field_${form.fieldIds.fullName}`]: `Notify User ${unique}`,
          [`field_${form.fieldIds.email}`]: submitterEmail,
        },
        submitterEmail,
        submitterName: `Notify User ${unique}`,
        honeypot: "",
      },
    });
    expect(res.status(), await res.text()).toBe(201);
    const body = await res.json();
    expect(body.formId).toBe(form.id);

    // Wait briefly for async email logging
    await new Promise((r) => setTimeout(r, 500));

    const adminLogs = await fetchEmailLog(request, form.notificationEmail, "form_submission_admin");
    expect(adminLogs.length).toBeGreaterThan(0);

    const confirmLogs = await fetchEmailLog(
      request,
      submitterEmail,
      "form_submission_confirmation",
    );
    expect(confirmLogs.length).toBeGreaterThan(0);
  });

  test("honeypot rejects bot submissions", async ({ request }) => {
    const { response, json } = await postSetupPublicFormScenario(request);
    test.skip(!response.ok() || !json?.success || !json.data, "seed failed");
    const form = json!.data!.notifyForm;
    const unique = Date.now();

    const res = await request.post(`/api/custom-forms/forms/${form.id}/submit`, {
      data: {
        responseData: {
          [`field_${form.fieldIds.fullName}`]: "Bot",
          [`field_${form.fieldIds.email}`]: `bot_${unique}@example.com`,
        },
        submitterEmail: `bot_${unique}@example.com`,
        honeypot: "http://spam.example",
      },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.message).toMatch(/rejected/i);
  });

  test("missing required field returns 400", async ({ request }) => {
    const { response, json } = await postSetupPublicFormScenario(request);
    test.skip(!response.ok() || !json?.success || !json.data, "seed failed");
    const form = json!.data!.notifyForm;

    const res = await request.post(`/api/custom-forms/forms/${form.id}/submit`, {
      data: {
        responseData: {
          [`field_${form.fieldIds.email}`]: "only@example.com",
        },
        submitterEmail: "only@example.com",
        honeypot: "",
      },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.message).toMatch(/required/i);
  });

  test("allowMultipleSubmissions false blocks duplicate email", async ({ request }) => {
    const { response, json } = await postSetupPublicFormScenario(request);
    test.skip(!response.ok() || !json?.success || !json.data, "seed failed");
    const form = json!.data!.notifyForm;
    const unique = Date.now();
    const email = `dup_${unique}@example.com`;
    const payload = {
      responseData: {
        [`field_${form.fieldIds.fullName}`]: "Dup User",
        [`field_${form.fieldIds.email}`]: email,
      },
      submitterEmail: email,
      honeypot: "",
    };

    const first = await request.post(`/api/custom-forms/forms/${form.id}/submit`, {
      data: payload,
    });
    expect(first.status()).toBe(201);

    const second = await request.post(`/api/custom-forms/forms/${form.id}/submit`, {
      data: payload,
    });
    expect(second.status()).toBe(400);
    const body = await second.json();
    expect(body.message).toMatch(/already submitted/i);
  });

  test("public submit rate limit returns 429 after burst", async ({ request }) => {
    // Uses publicForm which allows multiple submissions; rate limit is IP-based.
    const { response, json } = await postSetupPublicFormScenario(request);
    test.skip(!response.ok() || !json?.success || !json.data, "seed failed");
    const form = json!.data!.publicForm;

    let saw429 = false;
    // CI/test max is 8 per 15 min — send enough to trip (shared IP may already have hits)
    for (let i = 0; i < 20; i++) {
      const unique = `${Date.now()}_${i}`;
      const res = await request.post(`/api/custom-forms/forms/${form.id}/submit`, {
        data: {
          responseData: {
            [`field_${form.fieldIds.fullName}`]: `Rate ${unique}`,
            [`field_${form.fieldIds.email}`]: `rate_${unique}@example.com`,
            [`field_${form.fieldIds.agree}`]: true,
          },
          submitterEmail: `rate_${unique}@example.com`,
          honeypot: "",
        },
      });
      if (res.status() === 429) {
        saw429 = true;
        break;
      }
    }
    test.skip(
      !saw429 && !process.env.CI,
      "Rate limit not hit — restart server with FORM_SUBMIT_RATE_LIMIT=8 (CI webServer sets this)",
    );
    expect(saw429).toBeTruthy();
  });
});
