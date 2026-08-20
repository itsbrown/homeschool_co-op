export const SUPPLY_SCOPES = ["student", "class", "family"] as const;
export type SupplyScope = (typeof SUPPLY_SCOPES)[number];

export const SUPPLY_OWNER_TYPES = ["class", "session"] as const;
export type SupplyOwnerType = (typeof SUPPLY_OWNER_TYPES)[number];

export const ACTIVE_SUPPLY_ENROLLMENT_STATUSES = [
  "enrolled",
  "pending_admin_approval",
] as const;

export function isSupplyScope(value: string): value is SupplyScope {
  return (SUPPLY_SCOPES as readonly string[]).includes(value);
}

export function isSupplyOwnerType(value: string): value is SupplyOwnerType {
  return (SUPPLY_OWNER_TYPES as readonly string[]).includes(value);
}

export function normalizeSupplyMergeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

export function supplyMergeKey(item: {
  storeProductId?: number | null;
  name: string;
  scope: string;
}): string {
  if (item.storeProductId != null) {
    return `product:${item.storeProductId}:${item.scope}`;
  }
  return `name:${item.scope}:${normalizeSupplyMergeName(item.name)}`;
}

export type SupplyNeed = {
  supplyItemId: number;
  name: string;
  quantity: number;
  unit: string | null;
  scope: SupplyScope;
  required: boolean;
  notes: string | null;
  storeProductId: number | null;
  ownerType: SupplyOwnerType;
  ownerId: number;
  ownerName: string;
  childId: number;
  childName: string;
};

export type HouseholdSupplyAttribution = {
  childId: number;
  childName: string;
  ownerType: SupplyOwnerType;
  ownerId: number;
  ownerName: string;
};

export type HouseholdSupplyRow = {
  mergeKey: string;
  name: string;
  quantity: number;
  unit: string | null;
  scope: SupplyScope;
  required: boolean;
  notes: string | null;
  storeProductId: number | null;
  supplyItemIds: number[];
  checked: boolean;
  for: HouseholdSupplyAttribution[];
};

function ownerKey(need: Pick<SupplyNeed, "ownerType" | "ownerId">): string {
  return `${need.ownerType}:${need.ownerId}`;
}

function mergedQuantity(needs: SupplyNeed[]): number {
  const scope = needs[0]?.scope ?? "student";
  if (scope === "family") {
    return Math.max(...needs.map((n) => n.quantity), 1);
  }
  if (scope === "class") {
    const byOwner = new Map<string, number>();
    for (const need of needs) {
      const key = ownerKey(need);
      byOwner.set(key, Math.max(byOwner.get(key) ?? 0, need.quantity));
    }
    return [...byOwner.values()].reduce((sum, q) => sum + q, 0);
  }
  const byChild = new Map<number, number>();
  for (const need of needs) {
    byChild.set(need.childId, Math.max(byChild.get(need.childId) ?? 0, need.quantity));
  }
  return [...byChild.values()].reduce((sum, q) => sum + q, 0);
}

export function allSupplyItemIdsChecked(
  supplyItemIds: number[],
  checkedItemIds: Iterable<number> | Set<number>,
): boolean {
  if (supplyItemIds.length === 0) return false;
  const checked =
    checkedItemIds instanceof Set ? checkedItemIds : new Set(checkedItemIds);
  return supplyItemIds.every((id) => checked.has(id));
}

export function mergeSupplyNeeds(
  needs: SupplyNeed[],
  checkedItemIds: Iterable<number> | Set<number> = [],
): HouseholdSupplyRow[] {
  const checked =
    checkedItemIds instanceof Set ? checkedItemIds : new Set(checkedItemIds);
  const groups = new Map<string, SupplyNeed[]>();

  for (const need of needs) {
    const key = supplyMergeKey(need);
    const list = groups.get(key);
    if (list) list.push(need);
    else groups.set(key, [need]);
  }

  const rows: HouseholdSupplyRow[] = [];
  for (const [mergeKey, group] of groups) {
    const first = group[0];
    const supplyItemIds = [...new Set(group.map((n) => n.supplyItemId))];
    const attributions: HouseholdSupplyAttribution[] = [];
    const seenAttr = new Set<string>();
    for (const need of group) {
      const attrKey = `${need.childId}:${need.ownerType}:${need.ownerId}`;
      if (seenAttr.has(attrKey)) continue;
      seenAttr.add(attrKey);
      attributions.push({
        childId: need.childId,
        childName: need.childName,
        ownerType: need.ownerType,
        ownerId: need.ownerId,
        ownerName: need.ownerName,
      });
    }
    const notes = [...new Set(group.map((n) => n.notes).filter((n): n is string => !!n?.trim()))];
    rows.push({
      mergeKey,
      name: first.name,
      quantity: mergedQuantity(group),
      unit: first.unit,
      scope: first.scope,
      required: group.some((n) => n.required),
      notes: notes.length > 0 ? notes.join("; ") : null,
      storeProductId: first.storeProductId,
      supplyItemIds,
      checked: allSupplyItemIdsChecked(supplyItemIds, checked),
      for: attributions,
    });
  }

  rows.sort((a, b) => {
    if (a.required !== b.required) return a.required ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return rows;
}

export const DIMENSIONS_MATH_PLACEMENT_TESTS_URL =
  "https://www.singaporemath.com/pages/placement-tests";

/** Macaroni / Macaronis class titles — no Dimensions Math placement. */
export function isMacaroniClassName(name: string): boolean {
  return /\bmacaronis?\b/i.test(name);
}

export function householdNeedsDimensionsMathPlacement(
  items: Array<{ for: Array<{ ownerType: string; ownerName: string }> }>,
): boolean {
  return items.some((item) =>
    item.for.some((entry) => entry.ownerType === "class" && !isMacaroniClassName(entry.ownerName)),
  );
}

export function isDimensionsMathSupplyName(name: string): boolean {
  return /dimensions\s+math/i.test(name);
}

const EARLY_CHILDHOOD_LEVEL = /\b(?:pre[-\s]?k(?:a|b)?|pka|pkb|pk|ka|kb)\b/i;
const SECONDARY_LEVEL = /\b[6-8][ab]\b/i;
const ELEMENTARY_LEVEL = /\b[1-5][ab]\b/i;

/** Dimensions Math 1A–5B only. KA / Pre-K / 6A–8B do not get a placement-test badge. */
export function needsDimensionsMathPlacementTest(name: string): boolean {
  if (!isDimensionsMathSupplyName(name)) return false;
  if (EARLY_CHILDHOOD_LEVEL.test(name) || SECONDARY_LEVEL.test(name)) return false;
  return ELEMENTARY_LEVEL.test(name);
}

export function partitionDimensionsMathRows<T extends { name: string }>(rows: T[]): {
  math: T[];
  other: T[];
} {
  const math: T[] = [];
  const other: T[] = [];
  for (const row of rows) {
    if (isDimensionsMathSupplyName(row.name)) math.push(row);
    else other.push(row);
  }
  return { math, other };
}
