import { PARENT_ACCESS_CODE_QUERY_KEY, shouldShowParentDoorCode, type ParentAccessCodeResponse } from "../parent-access-code";

describe("shouldShowParentDoorCode", () => {
  it("hides when feature is off or code is missing", () => {
    expect(shouldShowParentDoorCode(undefined)).toBe(false);
    expect(shouldShowParentDoorCode({ enabled: false, locationId: 1, locationName: "Brighton", code: "4821" })).toBe(false);
    expect(shouldShowParentDoorCode({ enabled: true, locationId: 1, locationName: "Brighton", code: null })).toBe(false);
  });

  it("shows only when enabled and a code is present", () => {
    const data: ParentAccessCodeResponse = {
      enabled: true,
      locationId: 1,
      locationName: "Brighton",
      code: "4821",
    };
    expect(shouldShowParentDoorCode(data)).toBe(true);
    expect(PARENT_ACCESS_CODE_QUERY_KEY[0]).toBe("/api/parent/access-code");
  });
});
