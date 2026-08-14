# Family supply lists

Structured **what to buy / bring** lists on **classes** and **sessions**. Parents see a **household shopping list** built from active enrollments — not a scavenger hunt across class pages.

## Invariants

- **Author on the class or session.** Household view is computed.
- **Active enrollments only:** `enrolled` and `pending_admin_approval` (same rule as educator rosters). Waitlist / pending_payment / cancelled / withdrawn / completed do not pull items. Session `status=completed` or past `endDate` does **not** hide the list by itself.
- **Next session does not inherit.** Copy with **Copy from…** or re-enter items on the new class/session.
- **Three quantity scopes:**
  - `student` — max qty per child, then sum children
  - `class` — once per distinct class/session owner (two kids in the same class → 1)
  - `family` — once per household
- **Shop is the catalog.** Optional `store_product_id` → existing `store_products` (Amazon affiliate or owned merch). Do **not** paste Amazon URLs on the supply item.
- **Affiliate:** **Buy on Amazon** with `rel="noopener noreferrer sponsored"`. Never Add to cart / Stripe (`purchasableInCart: false`).
- **Owned merch:** **View in shop** when a published listing exists. Do not add store-lane items to the member cart from the supply list.
- Legacy `classes.materials` jsonb / marketplace textarea is unused.

## Schema

Migration [`server/migrations/258-supply-lists.sql`](../../../server/migrations/258-supply-lists.sql). Non-prod auto-apply: `ensureSupplyListsSchema`.

| Table | Role |
|-------|------|
| `supply_items` | `owner_type` `class` \| `session`, `owner_id`, qty, scope, optional `store_product_id` |
| `parent_supply_checks` | `(parent_id, supply_item_id)` — checking a merged row sets/clears all constituent ids |

Merge key: `product:{storeProductId}:{scope}` if linked, else `name:{scope}:{normalized name}`.

Class owner id is `classes.id` (enrollment `marketplaceClassId`, or `classId` when marketplace is null — some production seats only set `class_id`). Session owner id is `sessions.id`. A child with both session tuition and a class seat gets both lists.

## API

| Method | Path | Who |
|--------|------|-----|
| GET/PUT | `/api/supply-lists/:ownerType/:ownerId` | School admin |
| POST | `/api/supply-lists/:ownerType/:ownerId/copy` | School admin (same school) |
| GET | `/api/supply-lists/shop-products` | School admin picker |
| GET | `/api/supply-lists/copy-sources` | School admin |
| GET | `/api/parent/supply-list` | Parent household |
| PATCH | `/api/parent/supply-list/checks` | Parent |

Tenant: `store_product_id` must belong to the same `school_id`. Copy/list 403 across schools.

## UI

- School class details → **Supplies** tab (`SupplyListEditor`) — not the Edit Class form (`/schools/classes/:id/edit`)
- Sessions → **Supplies** on the session row (dedicated dialog, not the edit form)
- Parent sidebar + mobile menu: **Supply list** → `/parent/supplies` (shopping list / by child / by class)
- Dashboard Overview card and Quick Action always visible (empty copy when no items)
- Parent class details: class-only subset + link to household list

## Tests

- Unit: [`shared/__tests__/supply-list.test.ts`](../../../shared/__tests__/supply-list.test.ts)
- API: [`server/tests/integration/supply-lists-api.test.ts`](../../../server/tests/integration/supply-lists-api.test.ts)
- E2E: `e2e/school-admin-supply-list.spec.ts`, `e2e/parent-supply-list.spec.ts` — seed `POST /api/test/setup-supply-list-scenario`

## Key files

- `shared/supply-list.ts` — merge math
- `server/lib/supply-lists.ts` — data access
- `server/api/supply-lists.ts`
- `client/src/components/admin/SupplyListEditor.tsx`
- `client/src/pages/parent/ParentSupplyListPage.tsx`
