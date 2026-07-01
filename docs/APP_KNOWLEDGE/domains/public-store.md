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
- **Program images:** `sessions.cover_image` (migration 252) and `classes.cover_image`; admin `ImageUpload` uses presigned category `storePrograms`; catalog exposes `imageUrl` as `/public/store-programs/…`
- **Store-ready classes:** `enrollmentOpen` + price (same gate as parent catalog); not legacy `isPublished`
- **Merch photos:** `store_products.image_url`; admin `ImageUpload` with category `storeProducts`; public cards use square `object-cover` via `StoreProductCardImage`

### Image upload flow (store)

Same as platform file-storage skill:

1. `POST /api/unified-uploads/request-url` — `{ category: "storePrograms"|"storeProducts", name, size, contentType }` (schoolId optional; resolved from admin context)
2. Client `PUT` file to presigned URL (direct to GCS)
3. `POST /api/unified-uploads/confirm` — sets public ACL
4. Save returned `objectPath` (e.g. `/public/store-programs/school-1/2026-06-01/uuid.jpg`) on program/product

Public assets served at `GET /public/:path` (object storage). Legacy `/uploads/store-*` rows must be re-uploaded.

## API

- `GET /api/public/store/:storeSlug` — branding
- `GET /api/public/store/:storeSlug/catalog` — published listings
- `POST /api/public/store/:storeSlug/snapshot` — pricing (optional auth)
- `POST /api/public/store/:storeSlug/checkout` — Stripe Checkout Session or waitlist-only fulfillment
- `GET /api/public/store/:storeSlug/order/:token` — guest success page
- `GET /api/school-admin/public-store/programs` — admin: sessions + classes with listing state
- `PATCH /api/school-admin/public-store/programs/:listingType/:sourceId` — publish, members-only, cover image
- **Uploads:** `/api/unified-uploads/*` with categories `storePrograms`, `storeProducts` (not dedicated store multipart routes)

## Fulfillment

- Webhook: early `store_checkout` branch in `server/webhook-handler.ts`
- Durable cart: `store_checkout_snapshots` (Stripe metadata holds `snapshotId` only)
- Waitlist at capacity: no charge; enrollment `status=waitlist`
- Pay in full only on store lane (no biweekly/credits/promos)
- **E2E:** `e2e/public-store.spec.ts` — presigned upload helper `e2e/helpers/presignedUploadFlow.ts`; catalog `imageUrl`, admin UI, guest class checkout

## Key files

- `server/lib/store-pricing.ts`
- `server/lib/store-guest-checkout.ts`
- `server/lib/store-fulfillment.ts`
- `server/api/public-store.ts`
- `server/lib/store-programs.ts`
- `server/services/fileUploadService.ts` — `storePrograms`, `storeProducts` categories
- `client/src/lib/uploadClient.ts` — presigned client
- `client/src/components/ImageUpload.tsx` — `uploadCategory` prop
- `server/migrations/251-public-store.sql`
- `server/migrations/252-session-cover-image.sql`
