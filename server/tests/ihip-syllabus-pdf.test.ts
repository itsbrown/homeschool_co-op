import { describe, expect, it } from "@jest/globals";
import { generateIhipSyllabusPdf } from "../services/ihipSyllabusPdf";
import type { IhipSyllabusDto } from "../lib/build-ihip-syllabus";
import { parsePdfText } from "./helpers/parsePdfText";
import { ASA_INSTRUCTOR_FOOTER, ASA_PDF_AUTHOR, ASA_WORDMARK_LINE1 } from "../services/asa-pdf-brand";

const fixture: IhipSyllabusDto = {
  template: "ny-ihip-syllabus",
  templateVersion: "2026-09-asa-v2",
  schoolYear: "2026-2027",
  band: "lower",
  generatedAt: "2026-09-21T00:00:00.000Z",
  instructor: "Parent(s)",
  header: {
    studentName: "Ivy Seeker",
    gradeLevel: "3rd Grade",
    age: "8",
    campus: "Brighton",
    hourGuidance: "900 hrs/year (K–6)",
    quarterlyDates: ["Sep 15, 2026", "Nov 15, 2026", "Feb 15, 2027", "Apr 15, 2027"],
    classes: [{ title: "Seekers | Brighton | F2026", days: "Monday, Wednesday", hours: "9:00 AM–12:00 PM" }],
  },
  subjects: [
    {
      key: "reading",
      label: "Reading",
      required: true,
      coverage: "both",
      syllabus: "Taught during co-op meetings (Seekers Morning Circle). Parents continue this subject at home as needed.",
      slots: ["Seekers Morning Circle"],
      curriculum: ["Orthography notebook"],
      plan: [
        {
          weekNumber: 1,
          weekStartDate: "2026-09-14",
          title: "Seekers: Intro to Nature",
          objectives: ["Observe local plants", "Record weather notes"],
          description: "Outdoor observation of local plants and weather.",
        },
      ],
    },
    {
      key: "history",
      label: "History",
      required: true,
      coverage: "coop",
      syllabus: "Taught during co-op meetings (Yankee History Block).",
      slots: ["Yankee History Block"],
      curriculum: ["Primary source packet"],
      plan: [
        {
          weekNumber: 1,
          weekStartDate: "2026-09-14",
          title: "Yankee: Colonial Life",
          objectives: ["Name one local history topic"],
          description: null,
        },
      ],
    },
    {
      key: "pe",
      label: "Physical Education",
      required: true,
      coverage: "home",
      syllabus: "Parent complete — add curriculum materials and learning objectives for physical education.",
      slots: [],
      curriculum: [],
      plan: [],
    },
  ],
  materials: ["Orthography notebook"],
  weekOutline: [
    {
      weekNumber: 1,
      weekStartDate: "2026-09-14",
      subject: "History",
      title: "Yankee History Block",
      objective: "Name one local history topic",
    },
  ],
  gaps: ["Physical Education"],
  filingNotes: [
    "Use this packet as an alternate IHIP template, or copy each subject's curriculum and plan of instruction onto your district form.",
  ],
};

describe("IHIP syllabus PDF", () => {
  it("prints per-subject curriculum and learning objectives without school name", async () => {
    const buf = await generateIhipSyllabusPdf(fixture);
    expect(buf.subarray(0, 4).toString()).toBe("%PDF");
    const text = await parsePdfText(buf);
    expect(text).toContain("Ivy Seeker");
    expect(text).toContain(ASA_INSTRUCTOR_FOOTER);
    expect(text).toContain("Parent(s)");
    expect(text).toContain("Curriculum / materials");
    expect(text).toContain("Plan of instruction / learning objectives");
    expect(text).toContain("Observe local plants");
    expect(text).toContain("Yankee: Colonial Life");
    expect(text).toContain("Orthography notebook");
    expect(text).toMatch(/parent complete/i);
    expect(text).not.toMatch(/one-liner/);
    expect(text).not.toContain(ASA_WORDMARK_LINE1);
    expect(text).not.toContain(ASA_PDF_AUTHOR);
    expect(text).not.toMatch(/American Seekers/i);
    expect(text).not.toMatch(/drive\.google/);
    expect(text).not.toMatch(/https:\/\//);
  });
});
