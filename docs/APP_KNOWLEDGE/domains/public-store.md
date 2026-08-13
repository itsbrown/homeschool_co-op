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
- **Amazon affiliate products:** same `ImageUpload` / `storeProducts` cover upload as merch. `product_kind = 'affiliate'` (+ `affiliate_url`, `asin`, `affiliate_metadata`). Admin pastes an Associates URL → `POST …/affiliate/preview` (PA-API 5.0 or non-prod mock) → create product. Accepted: product `/dp/ASIN`, `amzn.to`, or search `amazon.com/s?k=…` **with ISBN-13/10 in the query** (ISBN-13 `978…` converts to ISBN-10 book ASIN). Search with no ISBN/ASIN returns `400` `ASIN_NOT_FOUND`. Mock image URL is the Associates ASIN widget (not `/images/I/{ASIN}`). Storefront CTA is **Buy on Amazon** (external); never Add to cart / Stripe. Broken covers overlay a Package icon on the `<img>` (do not unmount `src`). Migration `255-store-affiliate-products.sql`. Env: `AMAZON_PAAPI_ACCESS_KEY`, `AMAZON_PAAPI_SECRET_KEY`, `AMAZON_PAAPI_PARTNER_TAG` (optional `AMAZON_PAAPI_MOCK=1`). Local cover upload without Replit Object Storage uses the E2E disk stub. Non-prod school-admin store routes auto-apply 251+255 via `ensurePublicStoreSchema`.

### Image upload flow (store)

Same as platform file-storage skill:

1. `POST /api/unified-uploads/request-url` — `{ category: "storePrograms"|"storeProducts", name, size, contentType }` (schoolId optional; resolved from admin context)
2. Client `PUT` file to presigned URL (direct to GCS)
3. `POST /api/unified-uploads/confirm` — sets public ACL
4. Save returned `objectPath` (e.g. `/public/store-programs/school-1/2026-06-01/uuid.jpg`) on program/product

Public assets served at `GET /public/:path` (object storage). Legacy `/uploads/store-*` rows must be re-uploaded.

## Storefront UX

- **Browse** (`/store/:storeSlug`): Cards are teasers only (2-line description). Price, type badge, and dates show on the card; **“View program/product details”** opens the full page. School description shows once below the header (not in the sticky bar).
- **Detail** (`/store/:storeSlug/:itemSlug`): Same route for programs, sessions, and merch — layout adapts by `listingType` (stock/shipping copy for owned products; **Buy on Amazon** for affiliate; schedule/enrollment copy for programs). Full description is never truncated. **Share** button builds a message with description + link (`?userId=` when logged in).
- **Referral:** Landing with `?userId=` stores referrer in session; checkout saves `metadata.referral` on the order (self-referrals rejected server-side).
- **Sections:** When both exist, catalog groups **Programs & classes** (2-col grid) and **Shop** (3-col grid for merch + affiliate).
- **Affiliate cart guard:** Snapshot/checkout returns `400` + `AFFILIATE_NOT_PURCHASABLE` if an affiliate listing is submitted.

## API

- `GET /api/public/store/:storeSlug` — branding
- `GET /api/public/store/:storeSlug/catalog` — published listings (each item includes `slug`)
- `GET /api/public/store/:storeSlug/catalog/:catalogKey` — single item by **slug** or legacy numeric `listingId`
- `POST /api/public/store/:storeSlug/snapshot` — pricing (optional auth)
- `POST /api/public/store/:storeSlug/checkout` — Stripe Checkout Session or waitlist-only fulfillment; accepts optional `referredByUserId` + `referralCapturedAt` for share attribution
- `GET /api/public/store/:storeSlug/order/:token` — guest success page (branding, formatted order number, line items, child names)
- `GET /api/school-admin/public-store/programs` — admin: sessions + classes with listing state
- `GET /api/school-admin/public-store/signups` — program + product sign-ups with parent/child/emergency contact
- `GET /api/school-admin/public-store/signups/export` — CSV download
- `POST /api/school-admin/public-store/affiliate/preview` — `{ url }` → Amazon ASIN metadata (PA-API or mock)
- `PATCH /api/school-admin/public-store/programs/:listingType/:sourceId` — publish, members-only, cover image
- **Uploads:** `/api/unified-uploads/*` with categories `storePrograms`, `storeProducts` (not dedicated store multipart routes)
- **E2E:** `e2e/public-store-affiliate.spec.ts` — Buy on Amazon CTA, snapshot reject, admin fetch+create (mocked PA-API)

## Fulfillment

- Webhook: early `store_checkout` branch in `server/webhook-handler.ts`
- Durable cart: `store_checkout_snapshots` (Stripe metadata holds `snapshotId` only)
- Waitlist at capacity: no charge; enrollment `status=waitlist`
- Pay in full only on store lane (no biweekly/credits/promos)
- **E2E:** `e2e/public-store.spec.ts` — presigned upload helper `e2e/helpers/presignedUploadFlow.ts`; catalog `imageUrl`, admin UI, guest class checkout

### Guest checkout (programs)

- Steps: cart → parent contact (+ emergency contact for programs) → **delivery** (pickup or shipping + address when cart has products) → child per program line → payment
- Each program line requires a child (saved profile or inline draft with labeled DOB + grade)
- Multiple programs: different children allowed; “Use same child for all” copies first assignment
- Success: `/store/:slug/success?token=…` — school logo/name, formatted order number, line summary, document download links
- **Confirmation email:** sent on fulfillment (Stripe webhook or waitlist-only path) via `server/lib/store-confirmation-email.ts` — includes order summary, child names, confirmation link, and download links for **program delivery documents** (attached in Public Store → class/session edit). Idempotent via `store_orders.metadata.confirmationEmailSentAt`. Future: set `STORE_CONFIRMATION_ATTACH_DOCUMENTS=true` with SendGrid to attach files to the email.

### Admin sign-ups

- **Public Store → Sign-ups** tab: searchable table of public store registrations (class/session enrollments + merch line items)
- Filters: program name, status (enrolled / waitlist / pending / products)
- **Export CSV** includes child DOB & grade, parent contact, emergency contact, order number, payment totals
- Source: `program_enrollments.metadata.enrollmentSource = 'public_store'` + `store_order_items`

## Key files

- `server/lib/store-pricing.ts`
- `server/lib/store-guest-checkout.ts`
- `server/lib/store-fulfillment.ts`
- `server/api/public-store.ts`
- `server/lib/store-programs.ts`
- `server/services/fileUploadService.ts` — `storePrograms`, `storeProducts` categories
- `client/src/lib/uploadClient.ts` — presigned client
- `client/src/lib/store-checkout.ts` — checkout helpers + order number format
- `client/src/components/store/StoreCatalogCard.tsx` — browse card
- `client/src/components/store/StoreItemDetailView.tsx` — detail page (program vs merch layout)
- `client/src/lib/store-catalog-display.ts` — price/date labels, catalog sections
- `server/lib/store-listing-slug.ts` — title → slug assignment (collision suffix `-2`, …)
- `client/src/components/store/StoreCheckoutChildFields.tsx`
- `client/src/pages/public-store/PublicStoreCheckoutPage.tsx`
- `client/src/pages/public-store/PublicStoreSuccessPage.tsx`
- `server/lib/store-signups.ts`
- `server/lib/store-share-attribution.ts`
- `client/src/lib/store-item-share.ts`
- `client/src/lib/store-share-attribution.ts`
- `client/src/components/store/StoreItemShareButton.tsx`
- `client/src/components/store/StoreSignupsTab.tsx`
- `server/migrations/251-public-store.sql`
- `server/migrations/255-store-affiliate-products.sql`
- `server/lib/amazon-paapi.ts`
- `server/migrations/252-session-cover-image.sql`
