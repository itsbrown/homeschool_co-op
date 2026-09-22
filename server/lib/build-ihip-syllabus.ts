import { storage } from "../storage";
import { extractFamilyScheduleTiming } from "../utils/family-schedule";
import { annualHourGuidance, resolveProgressReportBand } from "./resolve-progress-report-band";
import {
  IHIP_INSTRUCTOR,
  IHIP_SYLLABUS_TEMPLATE_VERSION,
  ageFromBirthdate,
  buildSyllabusParagraph,
  extractObjectiveTexts,
  looksLikeExternalUrl,
  mapSlotToNySubject,
  normalizeSubjectForBand,
  requiredSubjectsForBand,
  schoolYearFromDate,
  suggestedQuarterlyDates,
  uniqueTrimmed,
  type IhipCoverage,
  type NyIhipBand,
  type NyIhipSubjectKey,
} from "../../shared/ny-ihip-syllabus";

export type IhipSyllabusLesson = {
  weekNumber: number;
  weekStartDate: string | null;
  title: string;
  objectives: string[];
  description: string | null;
};

export type IhipSyllabusSubjectRow = {
  key: NyIhipSubjectKey;
  label: string;
  required: boolean;
  coverage: IhipCoverage;
  syllabus: string;
  slots: string[];
  curriculum: string[];
  plan: IhipSyllabusLesson[];
};

export type IhipSyllabusWeekRow = {
  weekNumber: number;
  weekStartDate: string | null;
  subject: string;
  title: string;
  objective: string | null;
};

export type IhipSyllabusDto = {
  template: "ny-ihip-syllabus";
  templateVersion: string;
  schoolYear: string;
  band: NyIhipBand;
  generatedAt: string;
  instructor: typeof IHIP_INSTRUCTOR;
  header: {
    studentName: string;
    gradeLevel: string;
    age: string | null;
    campus: string | null;
    hourGuidance: string;
    quarterlyDates: string[];
    classes: Array<{ title: string; days: string; hours: string }>;
  };
  subjects: IhipSyllabusSubjectRow[];
  materials: string[];
  weekOutline: IhipSyllabusWeekRow[];
  gaps: string[];
  filingNotes: string[];
};

function formatClock(hhmm: string): string {
  const m = hhmm.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return hhmm;
  let h = parseInt(m[1], 10);
  const min = m[2];
  const ap = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${min} ${ap}`;
}

export async function buildIhipSyllabus(
  childId: number,
  schoolId: number,
): Promise<IhipSyllabusDto | null> {
  const child = await storage.getChildByIdForSchool(childId, schoolId);
  if (!child) return null;

  const band = resolveProgressReportBand(child.gradeLevel) as NyIhipBand;
  const schoolYear = schoolYearFromDate();
  const enrollments = await storage.getEnrollmentsByChildId(childId);
  const classIds = [
    ...new Set(
      enrollments
        .filter((e: any) => ["enrolled", "pending_admin_approval"].includes(String(e.status || "")))
        .map((e: any) => e.marketplaceClassId ?? e.classId)
        .filter((id: unknown): id is number => typeof id === "number" && id > 0),
    ),
  ];

  const classRows: IhipSyllabusDto["header"]["classes"] = [];
  let campus: string | null = null;
  let rangeStart: string | null = null;
  let rangeEnd: string | null = null;
  const skeletonsByClass = new Map<number, any[]>();

  const allSkeletons = await storage.getWeeklySkeletonsBySchool(schoolId);
  for (const classId of classIds) {
    const klass = await storage.getClassById(classId);
    if (!klass) continue;
    const timing = extractFamilyScheduleTiming(klass.schedule);
    const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const days = timing.scheduleDays.length
      ? timing.scheduleDays.map((d) => dayNames[d] || String(d)).join(", ")
      : (klass as any).sessionDays || "Meeting days on file";
    classRows.push({
      title: klass.title,
      days,
      hours: `${formatClock(timing.startTime)}–${formatClock(timing.endTime)}`,
    });
    if (!campus) {
      if ((klass as any).location) campus = String((klass as any).location);
      else if (klass.locationId) {
        const loc = await storage.getLocationById(klass.locationId);
        if (loc?.name) campus = loc.name;
      }
    }
    const start = klass.startDate ? String(klass.startDate).slice(0, 10) : null;
    const end = klass.endDate ? String(klass.endDate).slice(0, 10) : null;
    if (start && (!rangeStart || start < rangeStart)) rangeStart = start;
    if (end && (!rangeEnd || end > rangeEnd)) rangeEnd = end;
    skeletonsByClass.set(
      classId,
      allSkeletons.filter((s) => s.classId === classId),
    );
  }

  type SlotAcc = {
    titles: string[];
    descriptions: string[];
    weekTitles: string[];
    curriculum: string[];
    plan: IhipSyllabusLesson[];
  };
  const bySubject = new Map<NyIhipSubjectKey, SlotAcc>();
  const ensure = (key: NyIhipSubjectKey): SlotAcc => {
    let row = bySubject.get(key);
    if (!row) {
      row = { titles: [], descriptions: [], weekTitles: [], curriculum: [], plan: [] };
      bySubject.set(key, row);
    }
    return row;
  };

  const resolveKey = (subjectArea: string | null | undefined, title: string | null | undefined) => {
    const mapped = mapSlotToNySubject(subjectArea, title);
    return mapped ? normalizeSubjectForBand(mapped, band) : null;
  };

  for (const classId of classIds) {
    for (const skeleton of skeletonsByClass.get(classId) || []) {
      const blocks = await storage.getSkeletonBlocksBySkeletonId(skeleton.id);
      for (const block of blocks) {
        const title = block.defaultTitle || block.subject || "";
        const key = resolveKey(block.subjectArea, title);
        if (!key) continue;
        const acc = ensure(key);
        acc.titles.push(title);
        if (block.defaultDescription) acc.descriptions.push(block.defaultDescription);
      }
    }
  }

  const weekOutline: IhipSyllabusWeekRow[] = [];
  const materials: string[] = [];
  if (classIds.length > 0) {
    const plans = await storage.getPublishedWeekPlansForClassIds(schoolId, classIds);
    for (const plan of plans) {
      const blocks = await storage.getWeekPlanBlocksByWeekPlanId(plan.id);
      const skeletonBlocks = await storage.getSkeletonBlocksBySkeletonId(plan.skeletonId);
      const skelById = new Map(skeletonBlocks.map((b) => [b.id, b]));
      for (const block of blocks) {
        const skel = skelById.get(block.skeletonBlockId);
        const title = block.title || block.customTitle || skel?.defaultTitle || "Untitled";
        const key =
          resolveKey(skel?.subjectArea, title) ||
          resolveKey(skel?.subjectArea, skel?.defaultTitle) ||
          resolveKey((skel as { subject?: string | null } | undefined)?.subject, skel?.defaultTitle);
        if (!key) continue;
        const acc = ensure(key);
        acc.weekTitles.push(title);
        const objectives = extractObjectiveTexts(block.objectives);
        const description = (block.description || "").trim() || null;
        acc.plan.push({
          weekNumber: plan.weekNumber,
          weekStartDate: plan.weekStartDate ? String(plan.weekStartDate).slice(0, 10) : null,
          title,
          objectives,
          description,
        });
        weekOutline.push({
          weekNumber: plan.weekNumber,
          weekStartDate: plan.weekStartDate ? String(plan.weekStartDate).slice(0, 10) : null,
          subject: requiredSubjectsForBand(band).find((s) => s.key === key)?.label || key,
          title,
          objective: objectives[0] || null,
        });
        for (const mat of block.materials || []) {
          if (mat && !looksLikeExternalUrl(mat)) {
            acc.curriculum.push(mat);
            materials.push(mat);
          }
        }
      }
    }
    for (const classId of classIds) {
      try {
        const assets = await storage.getCurriculumAssetsByClassId(classId, schoolId);
        for (const asset of assets) {
          const name = asset.title || asset.name;
          if (!name || looksLikeExternalUrl(name)) continue;
          const key = resolveKey((asset as { subject?: string | null }).subject, name);
          if (key) ensure(key).curriculum.push(name);
          else materials.push(name);
        }
      } catch {
        // catalog optional
      }
    }
  }

  const defs = requiredSubjectsForBand(band);
  const subjects: IhipSyllabusSubjectRow[] = defs.map((def) => {
    const acc = bySubject.get(def.key);
    const hasCoop = !!acc && (acc.titles.length > 0 || acc.weekTitles.length > 0 || acc.curriculum.length > 0);
    const coverage: IhipCoverage = hasCoop ? (def.required ? "both" : "coop") : "home";
    return {
      key: def.key,
      label: def.label,
      required: def.required,
      coverage,
      syllabus: buildSyllabusParagraph({
        label: def.label,
        coverage,
        slotTitles: acc?.titles || [],
        weekTitles: acc?.weekTitles || [],
        description: acc?.descriptions[0] || null,
      }),
      slots: uniqueTrimmed(acc?.titles || []),
      curriculum: uniqueTrimmed(acc?.curriculum || []).slice(0, 16),
      plan: (acc?.plan || []).slice(0, 24),
    };
  });

  const gaps = subjects
    .filter((s) => s.coverage === "home" && s.required)
    .map((s) => s.label);

  const age = ageFromBirthdate((child as any).birthdate ?? (child as any).dateOfBirth);

  return {
    template: "ny-ihip-syllabus",
    templateVersion: IHIP_SYLLABUS_TEMPLATE_VERSION,
    schoolYear,
    band,
    generatedAt: new Date().toISOString(),
    instructor: IHIP_INSTRUCTOR,
    header: {
      studentName: `${child.firstName} ${child.lastName}`.trim(),
      gradeLevel: child.gradeLevel || "",
      age: age != null ? String(age) : null,
      campus,
      hourGuidance: annualHourGuidance(band).label,
      quarterlyDates: suggestedQuarterlyDates(rangeStart, rangeEnd, schoolYear),
      classes: classRows,
    },
    subjects,
    materials: uniqueTrimmed(materials).slice(0, 24),
    weekOutline: weekOutline.slice(0, 40),
    gaps,
    filingNotes: [
      "Use this packet as an alternate IHIP template, or copy each subject's curriculum and plan of instruction onto your district form.",
      "Each required subject needs syllabi, curriculum materials, textbooks, or a plan of instruction (8 NYCRR 100.10).",
      "List instructors as Parent(s). Do not list the co-op or a mentor as the school of record.",
      "For home-only subjects, write the curriculum and learning objectives in the blanks.",
      "Choose four quarterly report dates (suggested dates below). Instructional hours belong on quarterly reports, not this IHIP.",
    ],
  };
}
