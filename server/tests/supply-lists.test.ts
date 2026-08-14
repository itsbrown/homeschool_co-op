import { describe, expect, it } from "@jest/globals";
import { parseOwnerType, SupplyListError, supplyClassOwnerId } from "../lib/supply-lists";

describe("supply-lists helpers", () => {
  it("parseOwnerType accepts class and session", () => {
    expect(parseOwnerType("class")).toBe("class");
    expect(parseOwnerType("session")).toBe("session");
  });

  it("parseOwnerType rejects other owners", () => {
    expect(() => parseOwnerType("program")).toThrow(SupplyListError);
  });

  it("supplyClassOwnerId prefers marketplaceClassId then classId", () => {
    expect(
      supplyClassOwnerId({ childId: 1, marketplaceClassId: 64, classId: 99 }),
    ).toBe(64);
    expect(
      supplyClassOwnerId({ childId: 1, marketplaceClassId: null, classId: 64 }),
    ).toBe(64);
    expect(
      supplyClassOwnerId({ childId: 1, marketplaceClassId: null, classId: null }),
    ).toBeNull();
  });
});
