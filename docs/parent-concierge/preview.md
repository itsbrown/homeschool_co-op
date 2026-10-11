# Vercel preview (demo mode)

The Replit production app is unchanged. `package.json` `build` and `start` still compile and boot `server/index.ts` on port 5000. This page is only the Vercel preview of the parent concierge.

The demo sign-in cookie is `Secure` only when the request is HTTPS (`x-forwarded-proto`), which Vercel sets on the public alias. The preview does not use a database. `PREVIEW_DEMO_MODE` serves fake families from memory (Avery Quinn, Blake Rivera, Casey Nguyen, and children Rowan, Quinn, Skyler, Reese with age bands). Anonymous chat uses the enrollment notes. **Sign in as fake parent** signs in as Avery Quinn and does not call Supabase. SendGrid runs only when both `CONCIERGE_LEAD_EMAIL` and `SENDGRID_API_KEY` are set; otherwise the lead is logged in memory. Analytics stay in memory (`concierge_events` is not written).

## Project settings

Create a Vercel project from this repo. Do not set the production branch to this branch, and do not promote the deployment.

| Setting | Value |
|---------|--------|
| Root Directory | `.` (repository root) |
| Framework Preset | Other |
| Build Command | `VITE_PREVIEW_DEMO_MODE=1 npx vite build` |
| Output Directory | `dist/public` |
| Install Command | default (`npm install`) |

`vercel.json` already sets the framework, build command, output directory, and an SPA rewrite to `index.html`. Serverless functions are `api/index.ts` and `api/[...path].ts`. They wrap a small Express app (`server/preview/express-app.ts`) that mounts `POST /api/concierge/chat` and the demo sign-in routes. That app does not import `server/index.ts`.

Do not point the Vercel project at `npm run build` or `npm start`. Those stay the Replit production scripts.

## Environment variables (names only)

Set these on the Vercel project for Preview. Do not put values in git.

| Name | Required | Role |
|------|----------|------|
| `PREVIEW_DEMO_MODE` | yes | `1`. Without it the function refuses to start and does not open a database. |
| `VITE_PREVIEW_DEMO_MODE` | yes, at build time | `1`. The build command sets it. The client then skips `createClient` and shows **Sign in as fake parent**. |
| `AI_GATEWAY_API_KEY` | no | When set, chat uses AI Gateway. When unset, demo mode uses the mock enrollment answers and the `tool:` protocol. |
| `AI_GATEWAY_MODEL` | no | Default `anthropic/claude-sonnet-4.5`. |
| `CONCIERGE_LEAD_EMAIL` | no | With `SENDGRID_API_KEY`, leads are emailed. Without either one, leads are logged only. |
| `SENDGRID_API_KEY` | no | Same as above. |
| `SENDGRID_FROM_EMAIL` | no | Existing sender, only if SendGrid is used. |

Do not set `DATABASE_URL` to production, Neon, Supabase, Railway, or Replit. Do not set Supabase keys for this preview. Do not set `PREVIEW_DEMO_MODE` on the Replit production VM. `VERCEL` is set by Vercel. Do not set `VERCEL_ENV`; `production` on this project's alias is expected.

## Guard

`assertPreviewDemoAllowed` runs only when `PREVIEW_DEMO_MODE` is set. Demo mode is allowed when `VERCEL=1` (Vercel sets this; do not set it on Replit to bypass the guard) and all of the following are true:

- `REPLIT_DEPLOYMENT` is unset
- no Replit-style variable is set (`REPL_ID`, `REPL_OWNER`, `REPL_SLUG`, or any `REPLIT_*`)
- `DATABASE_URL` is empty or does not look like production (hosted host, or a database name containing `prod`)

The project `asa-concierge-preview` serves this demo on its Vercel production alias (`asa-concierge-preview.vercel.app`). `VERCEL_ENV` may be `production` there. The guard does not require `VERCEL_ENV=preview`.

`server/index.ts` runs the check at boot. Setting `PREVIEW_DEMO_MODE` on the Replit app exits the process. An empty `DATABASE_URL` is allowed on Vercel.

## What the preview is not

It is not the full school app. Payments, cart, and the unmounted Anthropic router are not part of this function. It is not a production deploy. Migration `268-concierge-events.sql` is not applied by the preview, because analytics stay in memory.
