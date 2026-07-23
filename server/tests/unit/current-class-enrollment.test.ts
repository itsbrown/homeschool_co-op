import { describe, expect, it } from "@jest/globals";
import {
  enrollmentLinksToClass,
  isClassStillCurrent,
  isCurrentClassEnrollment,
} from "../../../shared/current-class-enrollment";

describe("current-class-enrollment", () => {
  const now = new Date("2026-07-22T12:00:00.000Z");

  it("requires a class link", () => {
    expect(enrollmentLinksToClass({ marketplaceClassId: 1 })).toBe(true);
    expect(enrollmentLinksToClass({ classId: 2 })).toBe(true);
    expect(enrollmentLinksToClass({ sessionId: 2 } as any)).toBe(false);
  });

  it("treats missing end date as current", () => {
    expect(isClassStillCurrent(null, now)).toBe(true);
    expect(isClassStillCurrent(undefined, now)).toBe(true);
  });

  it("excludes classes that ended before today", () => {
    expect(isClassStillCurrent("2026-06-12T04:00:00.000Z", now)).toBe(false);
    expect(isClassStillCurrent("2026-07-22T05:00:00.000Z", now)).toBe(true);
    expect(isClassStillCurrent("2026-11-20T05:00:00.000Z", now)).toBe(true);
  });

  it("isCurrentClassEnrollment combines status, class link, and end date", () => {
    expect(
      isCurrentClassEnrollment(
        { status: "enrolled", marketplaceClassId: 18 },
        "2026-03-13T04:00:00.000Z",
        now,
      ),
    ).toBe(false);

    expect(
      isCurrentClassEnrollment(
        {
          status: "enrolled",
          marketplaceClassId: 154,
          programEndDate: "2026-11-20T05:00:00.000Z",
        },
        null,
        now,
      ),
    ).toBe(true);

    expect(
      isCurrentClassEnrollment(
        { status: "enrolled", marketplaceClassId: null, classId: null },
        null,
        now,
      ),
    ).toBe(false);

    expect(
      isCurrentClassEnrollment(
        { status: "completed", marketplaceClassId: 154 },
        "2026-11-20T05:00:00.000Z",
        now,
      ),
    ).toBe(false);
  });
});
