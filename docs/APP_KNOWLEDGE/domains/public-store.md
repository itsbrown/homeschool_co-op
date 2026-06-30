# Public store (v1)

Parallel **store lane** at `/store/:storeSlug` — isolated from member `/cart` checkout.

## Gates

| Gate | Env / field |
|------|-------------|
| Global browse | `PUBLIC_STORE_ENABLED=true` |
| Global checkout | `PUBLIC_STORE_CHECKOUT_ENABLED=true` or same as above |
| Per school | `schools.public_store_enabled` + `schools.store_slug` |

## Admin

- **Public Store** → `/school-admin/public-store` (settings, products, listings, orders) — sidebar item under **Finance** when `enabled_features.publicStore` or the school has activated the store
- **Sessions / Classes** → “List on public store” + purchase confirmation documents on save
- Programs are **not** duplicated — `store_listings` points at existing session/class rows

## API

- `GET /api/public/store/:storeSlug` — branding
- `GET /api/public/store/:storeSlug/catalog` — published listings
- `POST /api/public/store/:storeSlug/snapshot` — pricing (optional auth)
- `POST /api/public/store/:storeSlug/checkout` — Stripe Checkout Session or waitlist-only fulfillment
- `GET /api/public/store/:storeSlug/order/:token` — guest success page

## Fulfillment

- Webhook: early `store_checkout` branch in `server/webhook-handler.ts`
- Durable cart: `store_checkout_snapshots` (Stripe metadata holds `snapshotId` only)
- Waitlist at capacity: no charge; enrollment `status=waitlist`
- Pay in full only on store lane (no biweekly/credits/promos)
- **Merch photos:** `store_products.image_url`; admin upload at `POST /api/school-admin/public-store/upload/product-image` (requires Supabase bearer via `apiRequest` / `ImageUpload`); public cards use square `object-cover` crop via `StoreProductCardImage`
- **E2E:** `e2e/public-store.spec.ts` — schema ensure, catalog `imageUrl`, admin upload UI, guest display + cart

## Key files

- `server/lib/store-pricing.ts`
- `server/lib/store-guest-checkout.ts`
- `server/lib/store-fulfillment.ts`
- `server/api/public-store.ts`
- `server/migrations/251-public-store.sql`
