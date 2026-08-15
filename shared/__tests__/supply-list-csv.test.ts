import { describe, expect, it } from "@jest/globals";
import {
  autoDetectSupplyCsvMapping,
  parseSupplyCsvText,
  parseSupplyQtyNotes,
} from "../supply-list-csv";

describe("parseSupplyQtyNotes", () => {
  it("reads a bare number", () => {
    expect(parseSupplyQtyNotes("2")).toEqual({ quantity: 2, unit: null, qtyNotes: null });
  });

  it("splits 1 box into quantity + unit", () => {
    expect(parseSupplyQtyNotes("1 box")).toEqual({ quantity: 1, unit: "box", qtyNotes: null });
  });

  it("puts Daily / As needed into notes with qty 1", () => {
    expect(parseSupplyQtyNotes("Daily")).toEqual({
      quantity: 1,
      unit: null,
      qtyNotes: "Daily",
    });
    expect(parseSupplyQtyNotes("As needed")).toEqual({
      quantity: 1,
      unit: null,
      qtyNotes: "As needed",
    });
  });
});

describe("parseSupplyCsvText", () => {
  it("skips title rows and maps Fall 2026 sheet headers", () => {
    const csv = [
      "Yankee Doodles – Parent Supply List",
      "Source: Chelsey email",
      "",
      "Supply Item,Qty / Notes,Amazon Link (or Search),Additional Notes,Affiliate Link",
      "Water bottle,1,https://amzn.to/3Sx5xCq,Any durable kids water bottle,https://amzn.to/3Sx5xCq",
      "Crayons (24 count),1 box,,Crayola recommended,",
      "Copy paper,Daily,,8.5x11 copy paper,",
      ",",
    ].join("\n");

    const parsed = parseSupplyCsvText(csv);
    expect(parsed.headerRowIndex).toBe(3);
    expect(parsed.rows).toHaveLength(3);
    expect(parsed.rows[0]).toMatchObject({
      name: "Water bottle",
      quantity: 1,
      amazonUrl: "https://amzn.to/3Sx5xCq",
      notes: "Any durable kids water bottle",
    });
    expect(parsed.rows[1]).toMatchObject({
      name: "Crayons (24 count)",
      quantity: 1,
      unit: "box",
      notes: "Crayola recommended",
      amazonUrl: null,
    });
    expect(parsed.rows[2]).toMatchObject({
      name: "Copy paper",
      quantity: 1,
      notes: "Daily. 8.5x11 copy paper",
    });
  });

  it("prefers Affiliate Link over Amazon Link", () => {
    const csv = [
      "Item,Amazon Link,Affiliate Link",
      "Tissues,https://www.amazon.com/dp/B08AAAAAAA,https://www.amazon.com/dp/B08BBBBBBB",
    ].join("\n");
    const parsed = parseSupplyCsvText(csv);
    expect(parsed.rows[0].amazonUrl).toBe("https://www.amazon.com/dp/B08BBBBBBB");
  });

  it("auto-detects Item as the name column", () => {
    const mapping = autoDetectSupplyCsvMapping(["Item", "Qty", "Notes"]);
    expect(mapping.name).toBe("Item");
    expect(mapping.qty).toBe("Qty");
  });

  it("drops invalid Amazon URLs instead of storing them", () => {
    const csv = ["Item,Amazon Link", "Pencils,not-a-url"].join("\n");
    const parsed = parseSupplyCsvText(csv);
    expect(parsed.rows[0].name).toBe("Pencils");
    expect(parsed.rows[0].amazonUrl).toBeNull();
  });
});
