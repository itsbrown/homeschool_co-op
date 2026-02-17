---
name: asa-testing-deployment
description: Workflow configuration, port binding, testing patterns, and deployment considerations for the ASA Learning Platform. Use when starting the app, debugging workflow issues, writing tests, configuring the dev environment, or preparing for deployment.
---

# ASA Testing & Deployment

## Core Rules

- **Use "Start application" workflow** (`npm run dev`) — this is the correct workflow. "Start App" is a legacy duplicate.
- **Frontend binds to port 5000** on `0.0.0.0` — never bind anything else to port 5000.
- **Never use Docker or virtual environments** — Replit uses Nix; nested virtualization is not supported.
- **Never edit `vite.config.ts` or `server/vite.ts`** — the Vite setup handles frontend/backend on the same port with all aliases preconfigured.
- **Never edit `package.json` scripts** without explicit user approval.
- **Never edit `drizzle.config.ts`**.

## Workflow Configuration

### Primary Workflow: "Start application"
- **Command**: `npm run dev`
- Starts Express backend + Vite frontend on the same port
- Backend serves API routes, Vite serves frontend with HMR
- Auto-restarts after package installation

### Legacy Workflow: "Start App"
- **Command**: `NODE_ENV=development tsx server/index.ts`
- This is a duplicate/legacy workflow — do not use it
- If both are running, prefer "Start application"

### Workflow Management
- Always restart workflows after making server-side changes
- Verify workflows run without errors before returning to the user
- Check workflow logs if the app isn't responding

## Port Configuration

- **Port 5000**: Frontend + backend (Express + Vite dev server)
- Backend API routes: `/api/*` handled by Express
- Frontend routes: Everything else handled by Vite SPA fallback
- No proxy configuration needed — same port serves both

## Database Operations

- **Schema file**: `shared/schema.ts` (Drizzle ORM)
- **Push changes**: `npm run db:push` — never write raw SQL migrations
- **Force push**: `npm run db:push --force` if data-loss warning appears
- **Debug queries**: Use the SQL execution tool, not raw `psql`
- **Never run destructive SQL** (DROP, DELETE, UPDATE) without explicit user approval

## Testing Patterns

### End-to-End Testing (Playwright via run_test)
- Primary testing method for UI features, forms, multi-page flows
- Test against the running dev server on port 5000
- Application may have existing data — don't assume empty state
- Generate unique values (e.g., `nanoid`) for test data to avoid conflicts
- Include `data-testid` attributes on key interactive elements for reliable selectors

### What to Test with Playwright
- Frontend features and multi-page flows
- Form submission and validation
- Modal/dialog interactions
- Navigation and routing
- API + browser integration flows
- Visual verification of UI elements

### What NOT to Test with Playwright
- Pure backend logic with no frontend impact
- Simple text/copy changes
- Game-like interfaces where Playwright would fail

### Auth-Protected Testing
- Supabase auth is used — tests may need to handle login flows
- Google OAuth and other third-party providers cannot be automated via Playwright (providers block it)
- For admin/role-specific features: use DB queries to set user roles before testing (e.g., `UPDATE users SET ...`)

### API Testing
- Can test API routes directly in Playwright tests (fetch/POST)
- Include full endpoint details: method, request schema, expected response
- Test both success and error cases

### Manual Verification
- Use `curl` for quick API endpoint checks
- Check workflow logs for server errors
- Check browser console logs for frontend errors

## Environment Variables

- **Secrets** (API keys, credentials): Use the secrets request tool — never set directly or expose values
- **Regular env vars**: Use the env var set tool
- **Default environment**: Use `shared` unless different values are needed for dev/production
- **Frontend env vars**: Must be prefixed with `VITE_` to be accessible via `import.meta.env`
- View current vars/secrets with the env var view tool

## Deployment (Publishing)

- Use Replit's built-in publishing — no external hosting needed
- Publishing handles building, hosting, TLS, and health checks automatically
- App will be available at a `.replit.app` domain or custom domain
- Production logs are separate from development workflow logs — check them if the published app has issues

## Common Pitfalls

- **App not starting** → used "Start App" workflow instead of "Start application" → switch to "Start application" (`npm run dev`)
- **Frontend can't reach API** → port conflict or wrong binding → ensure only Express+Vite uses port 5000
- **Server changes not visible** → workflow not restarted after code changes → restart "Start application" and verify clean startup
- **Tests fail with "element not found"** → test assumes empty database state → generate unique test data with `nanoid` instead
- **Frontend env var undefined** → missing `VITE_` prefix → rename to `VITE_MY_VAR` and access via `import.meta.env.VITE_MY_VAR`
- **Schema change not applied** → wrote raw SQL migration file → use `npm run db:push` (Drizzle handles it)

## Best Practices

### Do
- Always use the "Start application" workflow (`npm run dev`)
- Always restart workflows after server-side changes and verify they start cleanly
- Always generate unique test data (nanoid) to avoid conflicts with existing records
- Always check workflow logs when debugging server issues
- Always use `npm run db:push` for schema changes — never write raw SQL migrations
- Always prefix frontend env vars with `VITE_`
- Always use the secrets tool for sensitive values like API keys

### Don't
- Don't use the "Start App" workflow — it's a legacy duplicate
- Don't bind anything other than the frontend to port 5000
- Don't use Docker, virtual environments, or containerization
- Don't edit `vite.config.ts`, `server/vite.ts`, or `drizzle.config.ts`
- Don't edit `package.json` scripts without user approval
- Don't write Playwright tests that assume empty database state
- Don't expose or log secrets/API keys in code
- Don't use raw `psql` for database debugging — use the SQL execution tool

## Key Files
- `server/index.ts` — Express server entry point, port binding
- `server/vite.ts` — Vite dev server integration (do not edit)
- `vite.config.ts` — Vite configuration with aliases (do not edit)
- `drizzle.config.ts` — Drizzle ORM config (do not edit)
- `shared/schema.ts` — database schema definitions
- `client/src/lib/queryClient.ts` — API client configuration
- `replit.md` — project documentation and architecture notes
