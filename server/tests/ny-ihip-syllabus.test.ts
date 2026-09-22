import { describe, expect, it } from "@jest/globals";
import {
  buildSyllabusParagraph,
  isSkippedSyllabusBlock,
  mapSlotToNySubject,
  normalizeSubjectForBand,
  parentCompletePrompt,
  requiredSubjectsForBand,
  suggestedQuarterlyDates,
} from "../../shared/ny-ihip-syllabus";

describe("NY IHIP syllabus mapper", () => {
  it("maps subjectArea before title", () => {
    expect(mapSlotToNySubject("Literacy", "Morning Circle")).toBe("reading");
    expect(mapSlotToNySubject("History", "Yankee History Block")).toBe("history");
    expect(mapSlotToNySubject(null, "Yankee: Colonial Life")).toBe("history");
    expect(mapSlotToNySubject("Latin", "Monday language")).toBe("foreign_language");
  });

  it("splits Monroe ELA rows from title keywords", () => {
    expect(mapSlotToNySubject(null, "Orthography notebook")).toBe("spelling");
    expect(mapSlotToNySubject("", "Handwriting practice")).toBe("writing");
    expect(mapSlotToNySubject(undefined, "Art of Argument")).toBe("english");
    expect(mapSlotToNySubject(null, "Reading, writing, spelling, and English language")).toBe("reading");
  });

  it("maps title keywords when subjectArea is empty", () => {
    expect(mapSlotToNySubject(null, "Preamble civics")).toBe("history");
    expect(mapSlotToNySubject(undefined, "Physical education")).toBe("pe");
  });

  it("skips dismiss / snack / reset blocks", () => {
    expect(isSkippedSyllabusBlock("Pack, dismiss")).toBe(true);
    expect(mapSlotToNySubject("Science", "Reset — compass")).toBe(null);
    expect(mapSlotToNySubject(null, "Snack")).toBe(null);
  });

  it("lists Monroe 1–6 rows vs secondary required subjects", () => {
    const k6 = requiredSubjectsForBand("early");
    const sec = requiredSubjectsForBand("secondary");
    expect(k6.map((s) => s.key)).toEqual([
      "math",
      "reading",
      "spelling",
      "writing",
      "english",
      "science",
      "history",
      "health",
      "visual_arts",
      "pe",
      "music",
      "foreign_language",
    ]);
    expect(k6.find((s) => s.key === "reading")?.required).toBe(true);
    expect(k6.find((s) => s.key === "foreign_language")?.required).toBe(false);
    expect(sec.find((s) => s.key === "foreign_language")?.required).toBe(true);
    expect(sec.some((s) => s.key === "reading")).toBe(false);
    expect(normalizeSubjectForBand("reading", "secondary")).toBe("english");
    expect(normalizeSubjectForBand("reading", "lower")).toBe("reading");
  });

  it("suggests four quarterly dates on a session range", () => {
    const dates = suggestedQuarterlyDates("2026-09-14", "2026-11-20", "2026-2027");
    expect(dates).toHaveLength(4);
  });

  it("writes a parent-complete prompt for home subjects", () => {
    const text = buildSyllabusParagraph({
      label: "Physical Education",
      coverage: "home",
      slotTitles: [],
      weekTitles: [],
    });
    expect(text).toBe(parentCompletePrompt("Physical Education"));
    expect(text).toMatch(/learning objectives/);
    expect(text).not.toMatch(/one-liner/);
  });
});
