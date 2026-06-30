# Public store (v1)

Parallel **store lane** at `/store/:storeSlug` — isolated from member `/cart` checkout.

## Gates

| Gate | Env / field |
|------|-------------|
| Global browse | `PUBLIC_STORE_ENABLED=true` |
| Global checkout | `PUBLIC_STORE_CHECKOUT_ENABLED=true` or same as above |
| Per school | `schools.public_store_enabled` + `schools.store_slug` |

## Admin

- **Public Store** → `/school-admin/public-store` (settings, **classes & programs**, products, orders) — sidebar item under **Finance** when `enabled_features.publicStore` or the school has activated the store
- **Sessions / Classes** → edit program content only; storefront visibility is managed under **Public Store → Classes & programs**
- Programs are **not** duplicated — `store_listings` points at existing session/class rows
- **Program images:** `sessions.cover_image` (migration 252) and `classes.cover_image`; upload at `POST …/upload/program-image`; catalog exposes `imageUrl`

## API

- `GET /api/public/store/:storeSlug` — branding
- `GET /api/public/store/:storeSlug/catalog` — published listings
- `POST /api/public/store/:storeSlug/snapshot` — pricing (optional auth)
- `POST /api/public/store/:storeSlug/checkout` — Stripe Checkout Session or waitlist-only fulfillment
- `GET /api/public/store/:storeSlug/order/:token` — guest success page
- `GET /api/school-admin/public-store/programs` — admin: sessions + classes with listing state
- `PATCH /api/school-admin/public-store/programs/:listingType/:sourceId` — publish, members-only, cover image
- `POST /api/school-admin/public-store/upload/program-image` — program hero image (5MB)

## Fulfillment

- Webhook: early `store_checkout` branch in `server/webhook-handler.ts`
- Durable cart: `store_checkout_snapshots` (Stripe metadata holds `snapshotId` only)
- Waitlist at capacity: no charge; enrollment `status=waitlist`
- Pay in full only on store lane (no biweekly/credits/promos)
- **Merch photos:** `store_products.image_url`; admin upload at `POST /api/school-admin/public-store/upload/product-image` (requires Supabase bearer via `apiRequest` / `ImageUpload`); public cards use square `object-cover` crop via `StoreProductCardImage`
- **E2E:** `e2e/public-store.spec.ts` — schema ensure, catalog `imageUrl`, admin upload UI, guest display + cart; **Classes & programs** tab publish toggle, program image upload, guest class checkout (test fulfill simulates Stripe webhook)

## Key files

- `server/lib/store-pricing.ts`
- `server/lib/store-guest-checkout.ts`
- `server/lib/store-fulfillment.ts`
- `server/api/public-store.ts`
- `server/lib/store-programs.ts`
- `server/migrations/251-public-store.sql`
- `server/migrations/252-session-cover-image.sql`
