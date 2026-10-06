import {
  formatSchoolCalendarDate,
  formatSchoolWallTimeLocal,
  isDocumentExpired,
  isFutureSchedule,
  parseDocumentExpiry,
  parseSchoolWallTime,
  shouldDeliverNotification,
} from "../school-timezone";

describe("school timezone wall clock", () => {
  it("keeps 11:00 AM Eastern when an event is loaded and saved again", () => {
    const stored = parseSchoolWallTime("2026-10-12T11:00");
    expect(stored.toISOString()).toBe("2026-10-12T15:00:00.000Z");

    const formValue = formatSchoolWallTimeLocal(stored.toISOString());
    expect(formValue).toBe("2026-10-12T11:00");

    const savedAgain = parseSchoolWallTime(formValue);
    expect(savedAgain.toISOString()).toBe(stored.toISOString());
    expect(parseSchoolWallTime("2026-10-12T12:00").toISOString()).toBe("2026-10-12T16:00:00.000Z");
  });

  it("uses standard time in January (UTC-5), not a fixed 4-hour offset", () => {
    expect(parseSchoolWallTime("2026-01-15T11:00").toISOString()).toBe("2026-01-15T16:00:00.000Z");
    expect(formatSchoolWallTimeLocal("2026-01-15T16:00:00.000Z")).toBe("2026-01-15T11:00");
  });

  it("does not reinterpret an instant that already has a timezone", () => {
    expect(parseSchoolWallTime("2026-10-12T15:00:00.000Z").toISOString()).toBe(
      "2026-10-12T15:00:00.000Z",
    );
    expect(parseSchoolWallTime("2026-10-12T11:00:00-04:00").toISOString()).toBe(
      "2026-10-12T15:00:00.000Z",
    );
  });

  it("queues an 8:00 AM Eastern send that was submitted at 12:35 AM Eastern", () => {
    const scheduled = parseSchoolWallTime("2026-10-06T08:00");
    const submittedAt = new Date("2026-10-06T04:35:11.000Z");
    expect(scheduled.toISOString()).toBe("2026-10-06T12:00:00.000Z");
    expect(isFutureSchedule(scheduled, submittedAt)).toBe(true);
    expect(isFutureSchedule(null, submittedAt)).toBe(false);
    expect(isFutureSchedule(submittedAt, submittedAt)).toBe(false);
    expect(
      shouldDeliverNotification({ status: "scheduled", scheduledFor: scheduled }, submittedAt),
    ).toBe(false);
    expect(shouldDeliverNotification({ status: "sending", scheduledFor: scheduled }, submittedAt)).toBe(
      true,
    );
    expect(shouldDeliverNotification({ status: "sending" }, submittedAt)).toBe(true);
  });

  it("stores a document expiry through the end of the entered Eastern calendar day", () => {
    const expiry = parseDocumentExpiry("2026-10-13");
    expect(expiry.toISOString()).toBe("2026-10-14T03:59:59.999Z");
    expect(formatSchoolCalendarDate(expiry)).toBe("Oct 13, 2026");

    expect(isDocumentExpired(expiry, new Date("2026-10-13T00:00:00.000Z"))).toBe(false);
    expect(isDocumentExpired(expiry, new Date("2026-10-14T03:59:59.999Z"))).toBe(false);
    expect(isDocumentExpired(expiry, new Date("2026-10-14T04:00:00.000Z"))).toBe(true);
  });

  it("shows a January expiry on the entered date, not the UTC date", () => {
    const expiry = parseDocumentExpiry("2026-01-15");
    expect(expiry.toISOString()).toBe("2026-01-16T04:59:59.999Z");
    expect(formatSchoolCalendarDate(expiry)).toBe("Jan 15, 2026");
    expect(isDocumentExpired(expiry, new Date("2026-01-16T04:59:59.998Z"))).toBe(false);
    expect(isDocumentExpired(expiry, new Date("2026-01-16T05:00:00.000Z"))).toBe(true);
  });

  it("leaves an absolute expiry timestamp unchanged", () => {
    const legacyUtcMidnight = "2026-10-13T00:00:00.000Z";
    expect(parseDocumentExpiry(legacyUtcMidnight).toISOString()).toBe(legacyUtcMidnight);
    expect(formatSchoolCalendarDate(legacyUtcMidnight)).toBe("Oct 12, 2026");
  });
});
