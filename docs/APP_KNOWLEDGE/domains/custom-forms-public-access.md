# Custom forms & public access (Form Builder)

School-admin **Form Builder** forms that applicants can open **without logging in** (`accessLevel: public`, `isActive: true`).

## Public URLs & routing

| Surface | Path / behavior |
|---------|-----------------|
| Applicant UI | `/forms/:slug` — [`DynamicFormPage.tsx`](../../../client/src/pages/DynamicFormPage.tsx); listed as public in [`App.tsx`](../../../client/src/App.tsx) (no auth redirect) |
| Load form | `GET /api/custom-forms/forms/by-slug/:slug` — no auth; only **public** active forms |
| Submit | `POST /api/custom-forms/forms/:formId/submit` — no auth; public forms only; honeypot + rate limit + required-field checks |
| Resume / file field | `POST …/request-upload-url` + `confirm-upload` — no auth; `formAttachments` category |
| Members-only forms | Same slug on public routes → **404**; use `by-slug-auth` + `submit-auth` with JWT |
| AI Smart Builder | `POST /api/form-builder-ai/chat` — school-admin JWT; draft only; apply via `POST …/apply-draft` |

**Share link pattern:** `https://<host>/forms/<slug>` (school admin copies from Form Builder).

## Mentor / educator application

| Item | Value |
|------|--------|
| Template slug | `mentor-application-template` (`isTemplate: true`, inactive) |
| Live slug (after clone/provision) | `mentor-application` |
| Seed templates | `npx tsx server/scripts/seed-form-templates.ts` |
| Provision live form | `provision-public-mentor-form.ts --school-id 2` for ASA prod ([runbook](../runbooks/public-mentor-application-form.md)) |
| Admin alternative | Form Builder → clone template → confirm **Active** + **Public** |

## Key files

| Area | Files |
|------|--------|
| API | [`server/api/custom-forms.ts`](../../../server/api/custom-forms.ts), [`server/lib/custom-form-submission.ts`](../../../server/lib/custom-form-submission.ts) |
| AI builder | [`server/api/form-builder-ai.ts`](../../../server/api/form-builder-ai.ts), [`FormSmartBuilderPanel.tsx`](../../../client/src/components/forms/FormSmartBuilderPanel.tsx) |
| Public UI | [`DynamicFormPage.tsx`](../../../client/src/pages/DynamicFormPage.tsx) |
| Admin | `FormBuilderPage.tsx`, `FormEditorPage.tsx`, `SubmissionsPage.tsx`, `PreviewFormPage.tsx` |
| Uploads | [`fileUploadService.ts`](../../../server/services/fileUploadService.ts) (`formAttachments`) |
| Template seed | [`seed-form-templates.ts`](../../../server/scripts/seed-form-templates.ts) |

## Testing

| Layer | Command / artifact |
|-------|-------------------|
| E2E public + upload | `npm run test:e2e -- e2e/public-custom-forms.spec.ts` |
| E2E editor fields | `npm run test:e2e -- e2e/form-editor-fields.spec.ts` |
| E2E notify + spam | `npm run test:e2e -- e2e/form-submission-notify-spam.spec.ts` |
| E2E Smart Builder | `npm run test:e2e -- e2e/form-smart-builder.spec.ts` (`FORM_BUILDER_AI_MOCK=1`) |
| E2E catalog | [`docs/E2E_COMMANDS.md`](../../E2E_COMMANDS.md) |
| Test seed | `POST /api/test/setup-public-form-scenario` (+ optional `linkSupabaseAuthAdmin`) → [`seedPublicFormScenario.ts`](../../../server/tests/helpers/seedPublicFormScenario.ts) |
| Email assert | `GET /api/test/email-log?recipient=&type=` |

**E2E upload stub:** When Playwright starts the dev server (`PLAYWRIGHT_WEB_SERVER=true`), `uploadBuffer` skips GCS so CI/local E2E does not need Replit object storage.

**UI test ids:** `text-form-title`, `button-submit`, `form-submit-success`, `input-honeypot`, `button-add-field`, `input-field-label-{id}`, `form-smart-builder`, `button-apply-draft`, `input-notification-emails`.

## Editor vs Save Form

| Action | Persists | Notes |
|--------|----------|-------|
| Edit field label/type/required | Debounced `PUT /api/custom-forms/fields/:id` (~400ms) | Functional `setState`; invalidates form + by-slug queries; toast on settled save |
| Add / delete / reorder field | Immediate POST / DELETE / reorder | Invalidates form queries |
| **Save Form** | Title, description, `isActive`, `accessLevel`, locations, fees, `settings` | Does not batch-save fields |
| **Preview** | Admin preview | Navigates to `/school-admin/forms/:id/preview` (not public slug) |

Public by-slug query uses `staleTime: 0` + `refetchOnMount: 'always'`.

## Notifications & spam

| Feature | Status |
|---------|--------|
| Submission DB insert | **Working** |
| Admin email on submit | **Working** when `notifyOnSubmission` — uses `notificationEmails` or school admin email (`form_submission_admin`) |
| Submitter confirmation | **Working** when `sendSubmitterConfirmation` + submitter email (`form_submission_confirmation`) |
| Honeypot | **Working** (`honeypot` / `website` body field) |
| Rate limit | **Working** on public submit (`FORM_SUBMIT_RATE_LIMIT`, default 30 / 8 in CI) |
| `allowMultipleSubmissions: false` | **Enforced** by email (or IP if no email) |
| Required fields | **Server-side** validated against `custom_form_fields` |

## AI Smart Builder

- Chat proposes a **draft** only (never sets `isActive` / `accessLevel: public`).
- Admin clicks **Apply draft** → `POST /api/custom-forms/forms/:id/apply-draft`.
- E2E uses `FORM_BUILDER_AI_MOCK=1` (set in `playwright.config.ts` webServer env).
- Pattern matches Parent Concierge tool-use; no external MCP.

## Pitfalls

| Symptom | Cause | Fix |
|---------|--------|-----|
| `/api/test/*` returns HTML | Stale process on :5000 without test routes | `node scripts/free-port-5000.mjs`; `CI=true npm run test:e2e` |
| Public slug 404 | Form not active or not `accessLevel: public` | Settings → Public + Active → Save Form |
| Upload 401/500 on prod | Old deploy or storage misconfigured | Redeploy; check object storage |
| Smart Builder 503 | No `ANTHROPIC_API_KEY` and mock off | Set key or `FORM_BUILDER_AI_MOCK=1` for local E2E |
| Template seed FK error | `school_id = 1` missing on prod | Templates use first school in DB (`isTemplate` only) |

## Related

- [`domains/ci-and-testing.md`](ci-and-testing.md)
- [`runbooks/public-mentor-application-form.md`](../runbooks/public-mentor-application-form.md)
- [`asa-ai-integration`](../../../.agents/skills/asa-ai-integration/SKILL.md) — Form Smart Builder
- [`asa-file-storage`](../../../.agents/skills/asa-file-storage/SKILL.md)
