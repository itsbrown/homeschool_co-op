import {
  buildAsaPrintColumnsFromWeekPlan,
  collectPrintTimeKeys,
  formatPrintTime,
  formatWeekOfRange,
  isBreakishTitle,
  joinPrintClassTitles,
  printBlockSubtitles,
  shortPrintTitle,
  toTimeKey,
} from "../asa-weekly-schedule-print";

describe("asa weekly schedule print helpers", () => {
  it("normalizes 12h and 24h start times to the same row key", () => {
    expect(toTimeKey("8:45 AM")).toBe("08:45");
    expect(toTimeKey("08:45")).toBe("08:45");
    expect(toTimeKey("1:00 pm")).toBe("13:00");
  });

  it("formats print times like the staff sheet", () => {
    expect(formatPrintTime("08:45")).toBe("8:45 AM");
    expect(formatPrintTime("13:00")).toBe("1:00 PM");
  });

  it("builds teaching-day columns from Sunday=0 skeleton days", () => {
    const columns = buildAsaPrintColumnsFromWeekPlan([
      {
        dayOfWeek: 5,
        slots: [{ startTime: "08:45", title: "Morning Arrival", objectives: ["Greet"], lessonLink: null }],
      },
      {
        dayOfWeek: 1,
        slots: [
          { startTime: "8:45 AM", title: "Morning Arrival", objectives: ["Welcome"], lessonLink: "https://example.test" },
          { startTime: "09:10", title: "Circle Time", objectives: [], lessonLink: null },
          { startTime: "09:10", title: "Duplicate slot ignored", objectives: [], lessonLink: null },
          { startTime: "10:00", title: "   ", objectives: [], lessonLink: null },
        ],
      },
    ]);

    expect(columns.map((col) => col.dayName)).toEqual(["Monday", "Friday"]);
    expect(collectPrintTimeKeys(columns)).toEqual(["08:45", "09:10"]);
    expect(columns[0].blocksByTime.get("08:45")?.lessonLink).toBe("https://example.test");
    expect(columns[0].blocksByTime.has("10:00")).toBe(false);
  });

  it("formats the staff WEEK OF range without UTC date shift", () => {
    expect(formatWeekOfRange("2026-09-14")).toBe("Sep 14 - Sep 20, 2026");
  });

  it("shortens marketplace titles and flags break rows", () => {
    expect(shortPrintTitle("Yankee Doodle | Brighton")).toBe("Yankee Doodle");
    expect(isBreakishTitle("Morning Arrival & Social Time")).toBe(true);
    expect(isBreakishTitle("Circle Time")).toBe(false);
  });

  it("prints the lesson description plus unique objectives so staff see what is taught", () => {
    expect(printBlockSubtitles({ title: "Circle Time", objectives: ["Greet"] })).toEqual(["Greet"]);
    expect(
      printBlockSubtitles({
        title: "Latin · Week 1 · familia",
        description:
          "Word of the Day: familia (family).\n\n10–32 Word Tree: anni / annu = year.",
        objectives: [
          "Say and use familia as Word of the Day.",
          "Write the root anni/annu at the base of a word tree.",
          "Play Quid hora est.",
        ],
      }),
    ).toEqual([
      "Word of the Day: familia (family).",
      "Say and use familia as Word of the Day.",
      "Write the root anni/annu at the base of a word tree.",
    ]);
  });

  it("joins morning and afternoon class titles for print", () => {
    expect(
      joinPrintClassTitles([
        "Pioneers & Patriots | Brighton | F2026",
        "Logic Hall | Brighton | F2026",
        "Pioneers & Patriots | Brighton | F2026",
      ]),
    ).toBe("Pioneers & Patriots · Logic Hall");
  });
});
