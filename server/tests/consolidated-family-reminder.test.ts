import { describe, expect, it } from "@jest/globals";
import { groupReminderItemsByParent } from "../lib/consolidated-family-reminder";
import { shouldSendReminder } from "../services/scheduled-payment-reminders";

describe("consolidated-family-reminder", () => {
  it("groups items by parent email", () => {
    const items = [
      { parentEmail: "a@test.com", id: 1 },
      { parentEmail: "a@test.com", id: 2 },
      { parentEmail: "b@test.com", id: 3 },
    ];
    const groups = groupReminderItemsByParent(items);
    expect(groups.size).toBe(2);
    expect(groups.get("a@test.com")).toHaveLength(2);
    expect(groups.get("b@test.com")).toHaveLength(1);
  });

  it("groups by parent and reminder tier when extra key provided", () => {
    const items = [
      { parentEmail: "a@test.com", daysUntil: 7 },
      { parentEmail: "a@test.com", daysUntil: 3 },
      { parentEmail: "a@test.com", daysUntil: 7 },
    ];
    const groups = groupReminderItemsByParent(items, (i) => String(i.daysUntil));
    expect(groups.size).toBe(2);
    expect(groups.get("a@test.com|7")).toHaveLength(2);
    expect(groups.get("a@test.com|3")).toHaveLength(1);
  });
});

describe("shouldSendReminder", () => {
  it("fires once per tier based on reminderCount", () => {
    expect(shouldSendReminder(7, 0)).toBe(true);
    expect(shouldSendReminder(7, 1)).toBe(false);
    expect(shouldSendReminder(0, 3)).toBe(true);
    expect(shouldSendReminder(-7, 5)).toBe(true);
    expect(shouldSendReminder(-7, 4)).toBe(false);
  });
});
