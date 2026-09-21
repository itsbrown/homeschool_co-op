import { describe, expect, it } from "@jest/globals";
import {
  extractDriveFileId,
  foldWordForGrid,
  parseLessonDocFields,
  HALLS,
  normalizeSlotTime,
  parseLessonDocHeadings,
  parseLessonPushPayload,
  resolveHallSlot,
  resolvePayloadSlot,
} from "../lesson-push";

describe("normalizeSlotTime", () => {
  it("accepts military and clock times", () => {
    expect(normalizeSlotTime("13:15")).toBe("13:15");
    expect(normalizeSlotTime("13:15:00")).toBe("13:15");
    expect(normalizeSlotTime("1:15 PM")).toBe("13:15");
    expect(normalizeSlotTime("1:00 pm")).toBe("13:00");
  });
});

describe("resolveHallSlot", () => {
  it("maps Logic and Grammar by the same 1:15 Monday Latin clock", () => {
    const logic = resolveHallSlot("logic", { dayOfWeek: 1, startTime: "1:15 PM" });
    const grammar = resolveHallSlot("grammar", { slotKey: "latin" });
    expect(logic.startTime).toBe("13:15");
    expect(grammar.slotKey).toBe("mon-latin");
    expect(HALLS.logic.skeletonName).toBe("Logic Hall | F2026 | Afternoon");
    expect(HALLS.grammar.skeletonName).toBe("Grammar Hall | F2026 | Brighton");
    expect(HALLS.grammar.slots).toHaveLength(15);
  });

  it("rejects an unknown slot", () => {
    expect(() => resolveHallSlot("logic", { dayOfWeek: 2, startTime: "13:15" })).toThrow(/No logic slot/);
  });
});

describe("parseLessonDocHeadings", () => {
  it("maps Title / Script / lists / Drive links", () => {
    const parsed = parseLessonDocHeadings(`
Title:
Latin · Week 2 · pater

Objectives:
- Say pater
- Add five branch words

Materials:
- Word tree PDF

Homework:
Review familia

Script:
Word of the Day: pater.
Then the tree.

Notes:
Trim the game if late.

Handouts:
https://docs.google.com/document/d/1ukIiZxV7bkG4PrrwhwqdDtwWaB2Whey49nfZ6iniNPE/edit
https://drive.google.com/file/d/1ENX5w3TNitv3w1AMUHCMKvuLBmJzThHa/view
`);
    expect(parsed.title).toBe("Latin · Week 2 · pater");
    expect(parsed.description).toContain("Word of the Day: pater");
    expect(parsed.objectives).toEqual(["Say pater", "Add five branch words"]);
    expect(parsed.materials).toEqual(["Word tree PDF"]);
    expect(parsed.homework).toBe("Review familia");
    expect(parsed.notes).toBe("Trim the game if late.");
    expect(parsed.handouts).toHaveLength(2);
    expect(extractDriveFileId(parsed.handouts[0])).toBe("1ukIiZxV7bkG4PrrwhwqdDtwWaB2Whey49nfZ6iniNPE");
  });

  it("reads a folder URL and rejects a short seed id", () => {
    expect(
      extractDriveFileId("https://drive.google.com/drive/folders/1ZabPoqBouabtps2aVJdKInJ-QqWh1zue"),
    ).toBe("1ZabPoqBouabtps2aVJdKInJ-QqWh1zue");
    expect(() => extractDriveFileId("seed-seekers-folder")).toThrow(/Could not read a Drive file id/);
  });

  it("requires Title and Script", () => {
    expect(() => parseLessonDocHeadings("Objectives:\n- x")).toThrow(/Title/);
  });

  it("reads branded Hall Docs without Title/Script labels", () => {
    const parsed = parseLessonDocFields(`
AMERICAN SEEKERS ACADEMY
Learn Better. Make Friends. Live Well.
LOGIC HALL · ART OF ARGUMENT
Answer the Claim, Not the Circumstance
Week 2 · Ad Hominem Circumstantial

What success looks like
By the end of the lesson you should be able to see each of these with your own eyes:
1. Define ad hominem circumstantial
2. Chorus Fair vs Attack

Materials
* Art of Argument TE
* Speech slips

01 · What this lesson is for
Today’s target: ad hominem circumstantial.

Timed mentor script · 35 minutes
2:10 Hook. Say the Latin.
`);
    expect(parsed.title).toBe("Answer the Claim, Not the Circumstance");
    expect(parsed.objectives).toEqual([
      "Define ad hominem circumstantial",
      "Chorus Fair vs Attack",
    ]);
    expect(parsed.materials).toEqual(["Art of Argument TE", "Speech slips"]);
    expect(parsed.description).toContain("2:10 Hook");
  });
});

describe("parseLessonPushPayload", () => {
  it("resolves slotKey latin to Monday 13:15", () => {
    const payload = parseLessonPushPayload({
      hall: "grammar",
      weekNumber: 2,
      slotKey: "latin",
      driveFileId: "1ukIiZxV7bkG4PrrwhwqdDtwWaB2Whey49nfZ6iniNPE",
      title: "Latin",
      description: "Script",
    });
    const slot = resolvePayloadSlot(payload);
    expect(slot.dayOfWeek).toBe(1);
    expect(slot.startTime).toBe("13:15");
  });

  it("requires a slot", () => {
    expect(() =>
      parseLessonPushPayload({
        hall: "logic",
        weekNumber: 2,
        driveFileId: "abc",
        title: "x",
        description: "y",
      }),
    ).toThrow();
  });
});

describe("foldWordForGrid", () => {
  it("strips macrons and punctuation", () => {
    expect(foldWordForGrid("famīlia")).toBe("FAMILIA");
    expect(foldWordForGrid("anni / annu")).toBe("ANNIANNU");
  });
});
