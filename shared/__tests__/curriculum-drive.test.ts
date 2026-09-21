import { describe, expect, it } from "@jest/globals";
import {
  bandsCompatible,
  blockLengthMinutes,
  classBandFromClass,
  isTeachingSkeletonBlock,
  matchCurriculumAssetsToBlocks,
  parseCurriculumFilename,
  weekPlanBlockMatchStatus,
} from "../curriculum-drive";

describe("classBandFromClass", () => {
  it("maps Grammar Hall to seekers even without grade levels", () => {
    expect(classBandFromClass({ title: "Grammar Hall | Brighton | F2026" })).toBe("seekers");
  });

  it("maps 3rd–4th grades to seekers", () => {
    expect(classBandFromClass({ title: "Afternoon", gradeLevels: ["3rd-grade", "4th-grade"] })).toBe(
      "seekers",
    );
  });

  it("maps Pioneers title and 5th grade", () => {
    expect(classBandFromClass({ title: "Pioneers | Brighton | F2026" })).toBe("pioneers");
    expect(classBandFromClass({ title: "Upper", gradeLevels: ["5th Grade"] })).toBe("pioneers");
  });

  it("maps Logic Hall separately from Seekers", () => {
    expect(classBandFromClass({ title: "Logic Hall | Brighton | F2026" })).toBe("logic");
  });
});

describe("parseCurriculumFilename", () => {
  it("reads week, band, and subject from a Seekers Latin file", () => {
    const parsed = parseCurriculumFilename("Seekers_Latin_Week1_familia.pdf");
    expect(parsed.band).toBe("seekers");
    expect(parsed.sessionNo).toBe(1);
    expect(parsed.subject).toBe("latin");
    expect(parsed.assetKind).toBe("lesson");
    expect(parsed.title).toMatch(/Seekers Latin Week1/i);
  });

  it("tags 10-week guides as guide", () => {
    expect(parseCurriculumFilename("Logic Hall 10-week afternoon guide").assetKind).toBe("guide");
    expect(parseCurriculumFilename("Living standards").assetKind).toBe("guide");
  });

  it("reads minutes when present", () => {
    expect(parseCurriculumFilename("Pioneers Science W2 50min").minutes).toBe(50);
  });
});

describe("isTeachingSkeletonBlock", () => {
  it("skips snack, reset, and dismiss", () => {
    expect(isTeachingSkeletonBlock({ blockType: "curriculum", defaultTitle: "Snack" })).toBe(false);
    expect(
      isTeachingSkeletonBlock({ blockType: "curriculum", defaultTitle: "Reset — Art of Argument out" }),
    ).toBe(false);
    expect(isTeachingSkeletonBlock({ blockType: "curriculum", defaultTitle: "Pack, dismiss" })).toBe(
      false,
    );
  });

  it("keeps curriculum and subject-area slots", () => {
    expect(
      isTeachingSkeletonBlock({ blockType: "curriculum", defaultTitle: "Seekers Morning Circle" }),
    ).toBe(true);
    expect(
      isTeachingSkeletonBlock({
        blockType: "flexible",
        subjectArea: "Latin",
        defaultTitle: "Foreign language (Latin)",
      }),
    ).toBe(true);
  });
});

describe("matchCurriculumAssetsToBlocks", () => {
  const latinBlock = {
    id: 1,
    blockType: "curriculum",
    subjectArea: "Latin",
    defaultTitle: "Foreign language (Latin)",
    startTime: "13:15",
    endTime: "14:00",
  };
  const resetBlock = {
    id: 2,
    blockType: "curriculum",
    defaultTitle: "Reset — compass",
    startTime: "14:00",
    endTime: "14:10",
  };
  const scienceBlock = {
    id: 3,
    blockType: "curriculum",
    subjectArea: "Science",
    defaultTitle: "Science (specimen + notebook)",
    startTime: "13:15",
    endTime: "14:00",
  };

  const seekersLatin = {
    id: 10,
    name: "Seekers Latin Week 1",
    band: "seekers",
    sessionNo: 1,
    subject: "latin",
    assetKind: "lesson",
    webViewLink: "https://drive.google.com/file/d/latin1/view",
    minutes: 40,
  };
  const pioneersScience = {
    id: 11,
    name: "Pioneers Science Week 1",
    band: "pioneers",
    sessionNo: 1,
    subject: "science",
    assetKind: "lesson",
    webViewLink: "https://drive.google.com/file/d/sci/view",
  };
  const seekersScience = {
    id: 12,
    name: "Seekers Science Week 1",
    band: "seekers",
    sessionNo: 1,
    subject: "science",
    assetKind: "lesson",
    webViewLink: "https://drive.google.com/file/d/ssci/view",
  };
  const unusedWeek2 = {
    id: 13,
    name: "Seekers Latin Week 2",
    band: "seekers",
    sessionNo: 2,
    subject: "latin",
    assetKind: "lesson",
    webViewLink: "https://drive.google.com/file/d/latin2/view",
  };

  it("does not attach a Pioneers file to a Seekers week", () => {
    const result = matchCurriculumAssetsToBlocks({
      blocks: [scienceBlock],
      assets: [pioneersScience],
      weekNumber: 1,
      classBand: "seekers",
    });
    expect(result[0].curriculumAssetId).toBeNull();
    expect(result[0].matchStatus).toBe("empty");
  });

  it("attaches one unused lesson per teaching slot and skips reset", () => {
    const result = matchCurriculumAssetsToBlocks({
      blocks: [latinBlock, resetBlock, scienceBlock],
      assets: [seekersLatin, seekersScience],
      weekNumber: 1,
      classBand: "seekers",
    });
    expect(result[0].curriculumAssetId).toBe(10);
    expect(result[0].lessonLink).toContain("latin1");
    expect(result[1].curriculumAssetId).toBeNull();
    expect(result[2].curriculumAssetId).toBe(12);
    expect(new Set(result.map((r) => r.curriculumAssetId).filter(Boolean)).size).toBe(2);
  });

  it("prefers unused assets in session order for the current week", () => {
    const result = matchCurriculumAssetsToBlocks({
      blocks: [latinBlock],
      assets: [unusedWeek2, seekersLatin],
      weekNumber: 1,
      classBand: "seekers",
      usedAssetIdsInTerm: [],
    });
    expect(result[0].curriculumAssetId).toBe(10);
  });

  it("skips assets already used in the term", () => {
    const result = matchCurriculumAssetsToBlocks({
      blocks: [latinBlock],
      assets: [seekersLatin],
      weekNumber: 1,
      classBand: "seekers",
      usedAssetIdsInTerm: [10],
    });
    expect(result[0].curriculumAssetId).toBeNull();
  });

  it("flags time overflow instead of padding", () => {
    const result = matchCurriculumAssetsToBlocks({
      blocks: [latinBlock],
      assets: [{ ...seekersLatin, minutes: 90 }],
      weekNumber: 1,
      classBand: "seekers",
    });
    expect(result[0].curriculumAssetId).toBe(10);
    expect(result[0].matchStatus).toBe("time_overflow");
    expect(blockLengthMinutes("13:15", "14:00")).toBe(45);
  });

  it("prefers a Google Doc lesson over a same-week PDF", () => {
    const result = matchCurriculumAssetsToBlocks({
      blocks: [{
        id: 4,
        blockType: "curriculum",
        subjectArea: "Art of Argument",
        defaultTitle: "Debate + writing",
        startTime: "14:10",
        endTime: "14:45",
      }],
      assets: [
        {
          id: 21,
          name: "ASA_Fall2026_AoA_Week2_Ad_Hominem_Circumstantial.pdf",
          sessionNo: 2,
          subject: "aoa",
          mimeType: "application/pdf",
        },
        {
          id: 22,
          name: "ASA Fall 2026 · Logic Hall · Week 2 · Answer the Claim, Not the Circumstance",
          sessionNo: 2,
          subject: "aoa",
          mimeType: "application/vnd.google-apps.document",
        },
      ],
      weekNumber: 2,
      classBand: "logic",
    });
    expect(result[0].curriculumAssetId).toBe(22);
  });

  it("tags Answer the Claim Docs as AoA even without the word AoA", () => {
    expect(parseCurriculumFilename("ASA Fall 2026 · Grammar Hall · Week 2 · Answer the Claim, Not the Circumstance").subject).toBe("aoa");
  });

  it("returns empty proposals when the catalog has no lessons", () => {
    const result = matchCurriculumAssetsToBlocks({
      blocks: [latinBlock],
      assets: [{ id: 99, name: "Living standards", assetKind: "guide", band: "seekers" }],
      weekNumber: 1,
      classBand: "seekers",
    });
    expect(result[0].curriculumAssetId).toBeNull();
    expect(result[0].title).toBeNull();
  });
});

describe("bandsCompatible / match chips", () => {
  it("rejects Logic Constitution on Seekers", () => {
    expect(bandsCompatible("seekers", "logic")).toBe(false);
    expect(bandsCompatible("seekers", "pioneers")).toBe(false);
    expect(bandsCompatible("seekers", "seekers")).toBe(true);
  });

  it("computes chip statuses", () => {
    expect(
      weekPlanBlockMatchStatus({
        isTeachingSlot: true,
        curriculumAssetId: 1,
        classBand: "seekers",
        assetBand: "pioneers",
      }),
    ).toBe("band_mismatch");
    expect(
      weekPlanBlockMatchStatus({
        isTeachingSlot: true,
        title: null,
        classBand: "seekers",
      }),
    ).toBe("empty");
    expect(
      weekPlanBlockMatchStatus({
        isTeachingSlot: true,
        curriculumAssetId: 1,
        classBand: "seekers",
        assetBand: "seekers",
        duplicateInTerm: true,
      }),
    ).toBe("duplicate");
  });
});
