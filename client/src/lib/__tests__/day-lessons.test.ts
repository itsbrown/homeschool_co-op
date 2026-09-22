import { groupDayLessons, mondayWeekStart, type DayLessonChildSource } from "../day-lessons";

const monday = new Date(2026, 8, 21);
const tuesday = new Date(2026, 8, 22);

function source(overrides: Partial<DayLessonChildSource> & Pick<DayLessonChildSource, "childId" | "classId">): DayLessonChildSource {
  return {
    childName: "Child",
    classTitle: "Class",
    blocks: [],
    skeletonBlocks: [],
    ...overrides,
  };
}

describe("mondayWeekStart", () => {
  it("uses the local Monday and keeps Sunday with the previous Monday", () => {
    expect(mondayWeekStart(monday)).toBe("2026-09-21");
    expect(mondayWeekStart(new Date(2026, 8, 27))).toBe("2026-09-21");
  });
});

describe("groupDayLessons", () => {
  const seekers: DayLessonChildSource = source({
    childId: 1,
    childName: "Adaluna Brown",
    classId: 10,
    classTitle: "Yankee Doodle | Brighton | F2026",
    skeletonBlocks: [
      { id: 100, dayOfWeek: 1, startTime: "09:00", endTime: "09:30", sortOrder: 0, defaultTitle: "Clean Up" },
      { id: 101, dayOfWeek: 2, startTime: "09:00", endTime: "10:00", sortOrder: 0, defaultTitle: "Tuesday only" },
    ],
    blocks: [
      { id: 500, skeletonBlockId: 100, title: "Clean Up", description: "Reset the room" },
      { id: 501, skeletonBlockId: 101, title: "Tuesday only" },
    ],
  });

  const hermione: DayLessonChildSource = source({
    childId: 2,
    childName: "Hermione Brown",
    classId: 20,
    classTitle: "Seekers | Brighton | F2026",
    skeletonBlocks: [
      { id: 200, dayOfWeek: 1, startTime: "10:00", endTime: "11:00", sortOrder: 0 },
    ],
    blocks: [{ id: 600, skeletonBlockId: 200, title: "Math" }],
  });

  it("keeps only lessons whose skeleton day matches the clicked date", () => {
    const mondayLessons = groupDayLessons([seekers], monday);
    expect(mondayLessons.lessonCount).toBe(1);
    expect(mondayLessons.children[0].sections[0].lessons.map((lesson) => lesson.title)).toEqual(["Clean Up"]);

    const tuesdayLessons = groupDayLessons([seekers], tuesday);
    expect(tuesdayLessons.children[0].sections[0].lessons.map((lesson) => lesson.title)).toEqual(["Tuesday only"]);
  });

  it("groups two children and leaves the class title off the row", () => {
    const grouped = groupDayLessons([seekers, hermione], monday);
    expect(grouped.showChildChips).toBe(true);
    expect(grouped.children.map((child) => child.childName)).toEqual(["Adaluna Brown", "Hermione Brown"]);

    const adaluna = grouped.children[0].sections[0];
    expect(adaluna.classTitle).toBe("Yankee Doodle | Brighton | F2026");
    expect(adaluna.lessons[0].title).toBe("Clean Up");
    expect(adaluna.lessons[0].title.includes(adaluna.classTitle)).toBe(false);
    expect(adaluna.lessons[0].blockId).toBe(500);
  });

  it("returns a single child with no chip list when filtered", () => {
    const grouped = groupDayLessons([seekers, hermione], monday, { childId: 2 });
    expect(grouped.showChildChips).toBe(false);
    expect(grouped.children).toHaveLength(1);
    expect(grouped.children[0].childName).toBe("Hermione Brown");
    expect(grouped.lessonCount).toBe(1);
  });

  it("skips skeleton slots that have no published plan block", () => {
    const draftOnly = source({
      childId: 3,
      classId: 30,
      classTitle: "Draft class",
      skeletonBlocks: [{ id: 300, dayOfWeek: 1, sortOrder: 0, defaultTitle: "Draft: Pending Publish" }],
      blocks: [],
    });
    const grouped = groupDayLessons([draftOnly, seekers], monday);
    expect(grouped.children.map((child) => child.childId)).toEqual([1]);
    expect(grouped.lessonCount).toBe(1);
  });
});
