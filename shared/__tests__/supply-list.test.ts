import { describe, expect, it } from "@jest/globals";
import {
  allSupplyItemIdsChecked,
  mergeSupplyNeeds,
  supplyMergeKey,
  type SupplyNeed,
} from "../supply-list";

function need(overrides: Partial<SupplyNeed> & Pick<SupplyNeed, "supplyItemId" | "name" | "scope">): SupplyNeed {
  return {
    quantity: 1,
    unit: null,
    required: true,
    notes: null,
    storeProductId: null,
    ownerType: "class",
    ownerId: 1,
    ownerName: "Trailblazers",
    childId: 10,
    childName: "Maya",
    ...overrides,
  };
}

describe("supplyMergeKey", () => {
  it("uses storeProductId when set", () => {
    expect(supplyMergeKey({ storeProductId: 7, name: "Tissues", scope: "class" })).toBe(
      "product:7:class",
    );
  });

  it("normalizes name + scope when no product", () => {
    expect(supplyMergeKey({ name: "  Water  Bottle ", scope: "student" })).toBe(
      "name:student:water bottle",
    );
  });
});

describe("mergeSupplyNeeds", () => {
  it("student scope multiplies by unique children (max qty per child)", () => {
    const rows = mergeSupplyNeeds([
      need({
        supplyItemId: 1,
        name: "Glue sticks",
        scope: "student",
        quantity: 2,
        childId: 10,
        childName: "Maya",
      }),
      need({
        supplyItemId: 1,
        name: "Glue sticks",
        scope: "student",
        quantity: 2,
        childId: 11,
        childName: "Liam",
        ownerId: 1,
      }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].quantity).toBe(4);
    expect(rows[0].for.map((f) => f.childName).sort()).toEqual(["Liam", "Maya"]);
  });

  it("class scope is once per class even with two kids in the same class", () => {
    const rows = mergeSupplyNeeds([
      need({
        supplyItemId: 2,
        name: "Tissues",
        scope: "class",
        childId: 10,
        childName: "Maya",
        ownerId: 1,
        ownerName: "Trailblazers",
      }),
      need({
        supplyItemId: 2,
        name: "Tissues",
        scope: "class",
        childId: 11,
        childName: "Liam",
        ownerId: 1,
        ownerName: "Trailblazers",
      }),
    ]);
    expect(rows[0].quantity).toBe(1);
  });

  it("class scope sums distinct classes", () => {
    const rows = mergeSupplyNeeds([
      need({
        supplyItemId: 2,
        name: "Tissues",
        scope: "class",
        storeProductId: 99,
        childId: 10,
        ownerId: 1,
        ownerName: "Trailblazers",
      }),
      need({
        supplyItemId: 3,
        name: "Kleenex",
        scope: "class",
        storeProductId: 99,
        childId: 11,
        childName: "Liam",
        ownerId: 2,
        ownerName: "Tycoons",
      }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].mergeKey).toBe("product:99:class");
    expect(rows[0].quantity).toBe(2);
    expect(rows[0].supplyItemIds.sort()).toEqual([2, 3]);
  });

  it("does not merge the same shop product across different scopes", () => {
    const rows = mergeSupplyNeeds([
      need({
        supplyItemId: 2,
        name: "Tissues",
        scope: "class",
        storeProductId: 7,
      }),
      need({
        supplyItemId: 8,
        name: "Glue sticks",
        scope: "student",
        storeProductId: 7,
        childId: 11,
        childName: "Liam",
        ownerId: 2,
        ownerName: "Tycoons",
      }),
    ]);
    expect(rows).toHaveLength(2);
  });

  it("family scope is once per household", () => {
    const rows = mergeSupplyNeeds([
      need({
        supplyItemId: 4,
        name: "Handbook",
        scope: "family",
        childId: 10,
        ownerType: "session",
        ownerId: 5,
        ownerName: "Fall 2026",
      }),
      need({
        supplyItemId: 4,
        name: "Handbook",
        scope: "family",
        childId: 11,
        childName: "Liam",
        ownerType: "session",
        ownerId: 5,
        ownerName: "Fall 2026",
      }),
    ]);
    expect(rows[0].quantity).toBe(1);
  });

  it("checked is true only when all constituent ids are checked", () => {
    const needs = [
      need({
        supplyItemId: 2,
        name: "Tissues",
        scope: "class",
        storeProductId: 1,
        ownerId: 1,
      }),
      need({
        supplyItemId: 3,
        name: "Tissues",
        scope: "class",
        storeProductId: 1,
        childId: 11,
        childName: "Liam",
        ownerId: 2,
        ownerName: "Tycoons",
      }),
    ];
    expect(mergeSupplyNeeds(needs, [2])[0].checked).toBe(false);
    expect(mergeSupplyNeeds(needs, [2, 3])[0].checked).toBe(true);
  });
});

describe("allSupplyItemIdsChecked", () => {
  it("requires every id", () => {
    expect(allSupplyItemIdsChecked([1, 2], [1, 2])).toBe(true);
    expect(allSupplyItemIdsChecked([1, 2], [1])).toBe(false);
    expect(allSupplyItemIdsChecked([], [1])).toBe(false);
  });
});
