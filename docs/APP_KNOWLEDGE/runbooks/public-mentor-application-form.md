# Public mentor / educator application form

Operational steps to go live with the Form Builder **Mentor / Educator Application** (resume upload + civic questions) for applicants **without login**.

## Code prerequisites (deploy first)

Deploy a build that includes:

- `POST /api/custom-forms/forms/:formId/upload-attachment` (`formAttachments` category)
- `file_upload` on [`DynamicFormPage.tsx`](../../../client/src/pages/DynamicFormPage.tsx)
- Template clone: any `isTemplate` form → school copy with `accessLevel: public`, slug without `-template`
- Admin resume download: `GET /api/custom-forms/submissions/:submissionId/files/:fieldId`

Until deployed, public `/forms/mentor-application` may load but resume upload will fail.

## 1. Seed the template (if missing)

On the target database (dev or prod):

```bash
# Dev
npx tsx server/scripts/seed-form-templates.ts

# Prod
node scripts/with-prod-env.mjs -- npx tsx server/scripts/seed-form-templates.ts
```

Confirms row: `slug = mentor-application-template`, `is_template = true`, `is_active = false`.

## 2. Provision the live public form

**Option A — Script (all schools or one school):**

```bash
# Preview
npx tsx server/scripts/provision-public-mentor-form.ts --dry-run

# One school (prod ASA = school id 2)
npx tsx server/scripts/provision-public-mentor-form.ts --school-id 2

# Prod
node scripts/with-prod-env.mjs -- npx tsx server/scripts/provision-public-mentor-form.ts --school-id 2
```

Creates (or reactivates) per school:

- `slug`: `mentor-application`
- `is_active`: true
- `access_level`: public

**Option B — School admin UI:**

1. School Admin → **Form Builder**
2. Open template **Mentor / Educator Application**
3. **Clone template** (sets public access and slug `mentor-application`)
4. Confirm **Active** and **Public** access

## 3. Share the link

```
https://<your-host>/forms/mentor-application
```

Multi-school: each school gets its own cloned form; slugs can match `mentor-application` per `school_id` (unique per school in practice via separate rows).

## 4. Verify

| Check | How |
|-------|-----|
| Public load | Open link in incognito → form fields + resume file input |
| Upload | Choose a PDF → no login prompt; filename appears under field |
| Submit | Complete required fields → thank-you message |
| Admin | Form Builder → Submissions → open row → resume download link |

**Automated (local/CI):**

```bash
npm run test:e2e -- e2e/public-custom-forms.spec.ts
```

Covers public API, `upload-attachment`, and browser resume upload (uses in-memory stub when `PLAYWRIGHT_WEB_SERVER=true`).

## Troubleshooting

| Issue | Fix |
|-------|-----|
| 404 on `/forms/mentor-application` | Run provision script or clone template; ensure `is_active` |
| Upload 500 | Deploy attachment code; prod needs object storage configured |
| Template missing | `seed-form-templates.ts` on that DB |
| Wrong school branding | Form `school_id` must match the school you intend |
