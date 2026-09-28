import {
  asTrimmedStrings,
  descriptionPreviewText,
  firstDescriptionParagraph,
  formatGroupLabel,
  formatGroupLabels,
  expandLessonLinkFields,
  lessonLinkButtonLabel,
  lessonLinksForForm,
  lessonLinksFromBlock,
  lessonTeachingPreview,
  splitLessonLinks,
} from "../week-plan-lesson-content";

describe("week plan lesson content helpers", () => {
  it("takes the first non-empty paragraph and truncates long copy", () => {
    expect(firstDescriptionParagraph("  \nWord of the Day: familia.\nNext line")).toBe(
      "Word of the Day: familia.",
    );
    expect(firstDescriptionParagraph("a".repeat(200), 20)).toMatch(/…$/);
  });

  it("formats differentiation groups from strings or objects", () => {
    expect(formatGroupLabel("Seekers")).toBe("Seekers");
    expect(formatGroupLabel({ name: "Pioneers", students: "Maya, Leo", notes: "read aloud" })).toBe(
      "Pioneers: Maya, Leo · read aloud",
    );
    expect(formatGroupLabels([{ name: "Patriots" }, "Flexible", { name: "" }])).toEqual([
      "Patriots",
      "Flexible",
    ]);
  });

  it("builds a compact teaching preview for week-grid cards", () => {
    expect(asTrimmedStrings(["  A  ", "", 3, "B"])).toEqual(["A", "B"]);
    expect(
      lessonTeachingPreview({
        description: "Fight the claim, not the person.\n\nTimed script follows.",
        objectives: ["Define ad hominem.", "Chorus Fair vs Attack.", "Write a speech slip.", "Extra"],
        materials: ["Speech slips", "Art of Argument TE", "Pencils"],
        maxObjectives: 3,
        maxMaterials: 2,
      }),
    ).toEqual({
      descriptionPreview: "Fight the claim, not the person.\nTimed script follows.",
      objectives: ["Define ad hominem.", "Chorus Fair vs Attack.", "Write a speech slip."],
      materials: ["Speech slips", "Art of Argument TE"],
    });
  });

  it("keeps the activity under a heading line", () => {
    expect(
      descriptionPreviewText(
        "1. Welcome & Greeting\n-Welcome each child as they join the circle.\n\n2. Calendar — 5 minutes\nIdentify the day of the week.",
      ),
    ).toBe(
      "1. Welcome & Greeting\n-Welcome each child as they join the circle.\n2. Calendar — 5 minutes\nIdentify the day of the week.",
    );
    expect(
      descriptionPreviewText("Pre-K Group:\nLovevery Kit- Follow the Sound Maze\n\nKindergarten Group:\nLovevery Kit - Rhyming Leaves Game"),
    ).toBe(
      "Pre-K Group:\nLovevery Kit- Follow the Sound Maze\nKindergarten Group:\nLovevery Kit - Rhyming Leaves Game",
    );
  });

  it("merges lessonLink and resources without empties or duplicates", () => {
    expect(
      lessonLinksFromBlock({
        lessonLink: "https://docs.google.com/document/d/abc/edit",
        resources: [
          "https://docs.google.com/document/d/abc/edit",
          "https://drive.google.com/file/d/xyz/view",
          "  ",
        ],
      }),
    ).toEqual([
      "https://docs.google.com/document/d/abc/edit",
      "https://drive.google.com/file/d/xyz/view",
    ]);
    expect(lessonLinksForForm({ lessonLink: null, resources: [] })).toEqual([""]);
    expect(
      splitLessonLinks([
        "https://drive.google.com/file/d/one/view",
        "",
        "https://drive.google.com/file/d/two/view",
        "https://drive.google.com/file/d/one/view",
      ]),
    ).toEqual({
      lessonLink: "https://drive.google.com/file/d/one/view",
      resources: [
        "https://drive.google.com/file/d/one/view",
        "https://drive.google.com/file/d/two/view",
      ],
    });
    expect(lessonLinkButtonLabel("https://drive.google.com/file/d/xyz/view", 0)).toBe("Open Lesson");
    expect(lessonLinkButtonLabel("https://drive.google.com/file/d/xyz/view", 1)).toBe("Open Drive 2");
  });

  it("splits a pasted blob of several lesson URLs into separate fields", () => {
    expect(
      expandLessonLinkFields([
        "https://docs.google.com/document/d/abc/edit https://drive.google.com/file/d/pdf/view",
        "https://drive.google.com/file/d/craft/view",
      ]),
    ).toEqual([
      "https://docs.google.com/document/d/abc/edit",
      "https://drive.google.com/file/d/pdf/view",
      "https://drive.google.com/file/d/craft/view",
    ]);
    expect(
      expandLessonLinkFields([
        "https://docs.google.com/document/d/abc/edit|https://drive.google.com/file/d/pdf/view",
      ]),
    ).toEqual([
      "https://docs.google.com/document/d/abc/edit",
      "https://drive.google.com/file/d/pdf/view",
    ]);
    expect(expandLessonLinkFields(["https://docs.google.com/document/d/abc"])).toEqual([
      "https://docs.google.com/document/d/abc",
    ]);
    expect(expandLessonLinkFields([""])).toEqual([""]);
  });
});
