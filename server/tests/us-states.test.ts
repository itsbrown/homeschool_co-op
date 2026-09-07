import { describe, expect, it } from "@jest/globals";
import { normalizeUsState, usStateLabel, isUsStateCode } from "../../shared/us-states";

describe("normalizeUsState", () => {
  it("normalizes codes and names", () => {
    expect(normalizeUsState("NY")).toBe("NY");
    expect(normalizeUsState("ny")).toBe("NY");
    expect(normalizeUsState("New York")).toBe("NY");
    expect(normalizeUsState("georgia")).toBe("GA");
    expect(normalizeUsState("DC")).toBe("DC");
    expect(normalizeUsState("Washington D.C.")).toBe("DC");
  });

  it("returns null for unknown", () => {
    expect(normalizeUsState("")).toBeNull();
    expect(normalizeUsState("Narnia")).toBeNull();
    expect(normalizeUsState(null)).toBeNull();
  });

  it("labels and type guard", () => {
    expect(usStateLabel("NY")).toBe("New York");
    expect(isUsStateCode("FL")).toBe(true);
    expect(isUsStateCode("XX")).toBe(false);
  });
});
