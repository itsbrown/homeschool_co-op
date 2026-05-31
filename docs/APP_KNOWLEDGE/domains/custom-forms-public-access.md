# Custom forms & public access (Form Builder)

School-admin **Form Builder** forms that applicants can open **without logging in** (`accessLevel: public`, `isActive: true`).

## Public URLs & routing

| Surface | Path / behavior |
|---------|-----------------|
| Applicant UI | `/forms/:slug` — [`DynamicFormPage.tsx`](../../../client/src/pages/DynamicFormPage.tsx); listed as public in [`App.tsx`](../../../client/src/App.tsx) (no auth redirect) |
| Load form | `GET /api/custom-forms/forms/by-slug/:slug` — no auth; only **public** active forms |
| Submit | `POST /api/custom-forms/forms/:formId/submit` — no auth; public forms only |
| Resume / file field | `POST /api/custom-forms/forms/:formId/upload-attachment` — no auth; `formAttachments` category |
| Members-only forms | Same slug on public routes → **404**; use `by-slug-auth` + `submit-auth` with JWT |

**Share link pattern:** `https://<host>/forms/<slug>` (school admin copies from Form Builder).

## Mentor / educator application

| Item | Value |
|------|--------|
| Template slug | `mentor-application-template` (`isTemplate: true`, inactive) |
| Live slug (after clone/provision) | `mentor-application` |
| Seed templates | `npx tsx server/scripts/seed-form-templates.ts` |
| Provision live form | `provision-public-mentor-form.ts --school-id 2` for ASA prod ([runbook](../runbooks/public-mentor-application-form.md)) |
| Admin alternative | Form Builder → clone template → confirm **Active** + **Public** |

Prod requires **deploy** of upload-attachment + `file_upload` UI before resume upload works in production.

## Key files

| Area | Files |
|------|--------|
| API | [`server/api/custom-forms.ts`](../../../server/api/custom-forms.ts) |
| Public UI | [`client/src/pages/DynamicFormPage.tsx`](../../../client/src/pages/DynamicFormPage.tsx) |
| Admin | `FormBuilderPage.tsx`, `FormEditorPage.tsx`, `SubmissionsPage.tsx` |
| Uploads | [`server/services/fileUploadService.ts`](../../../server/services/fileUploadService.ts) (`formAttachments`) |
| Template seed | [`server/scripts/seed-form-templates.ts`](../../../server/scripts/seed-form-templates.ts) |

## Testing

| Layer | Command / artifact |
|-------|-------------------|
| E2E (public + upload) | `npm run test:e2e -- e2e/public-custom-forms.spec.ts` |
| E2E catalog | [`docs/E2E_COMMANDS.md`](../../E2E_COMMANDS.md) — **add a row when adding specs** |
| Test seed | `POST /api/test/setup-public-form-scenario` → [`seedPublicFormScenario.ts`](../../../server/tests/helpers/seedPublicFormScenario.ts) |

**E2E upload stub:** When Playwright starts the dev server (`PLAYWRIGHT_WEB_SERVER=true`), `uploadBuffer` skips GCS so CI/local E2E does not need Replit object storage. Production uses real storage.

**UI test ids:** `text-form-title`, `button-submit`, `form-submit-success`, `file-field-{id}`, `file-uploaded-{id}`, `input-field-{id}`, `checkbox-field-{id}`.

## Pitfalls

| Symptom | Cause | Fix |
|---------|--------|-----|
| `/api/test/*` returns HTML | Stale process on :5000 without test routes | `node scripts/free-port-5000.mjs`; `CI=true npm run test:e2e` |
| Public slug 404 | Form not active or not `accessLevel: public` | Clone/provision; set active + public |
| Upload 500 on prod | Old deploy or storage misconfigured | Deploy attachment code; check object storage |
| Template seed FK error | `school_id = 1` missing on prod | Templates use first school in DB (`isTemplate` only) |

## Related

- [`domains/ci-and-testing.md`](ci-and-testing.md) — CI, Playwright, agent knowledge maintenance
- [`runbooks/public-mentor-application-form.md`](../runbooks/public-mentor-application-form.md) — prod go-live steps
- [`asa-file-storage`](../../../.agents/skills/asa-file-storage/SKILL.md) — upload categories
