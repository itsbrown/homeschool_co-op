/** Lesson detail shown inside the day sheet. Matches `WeekPlanBlockDetail`. */
export type DayLessonDetail = {
  title: string;
  description?: string | null;
  blockType?: string;
  isCompleted?: boolean;
  objectives?: unknown;
  groups?: unknown;
  notes?: string | null;
  lessonLink?: string | null;
  materials?: unknown;
  homework?: string | null;
  resources?: unknown;
  timeLabel?: string;
};

/** Monday of the local week containing `from`, as YYYY-MM-DD. Sunday belongs to the previous Monday. */
export function mondayWeekStart(from: Date): string {
  const d = new Date(from);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export type DayLessonPlanBlock = {
  id: number;
  skeletonBlockId: number;
  title?: string | null;
  description?: string | null;
  blockType?: string | null;
  isCompleted?: boolean | null;
  objectives?: unknown;
  groups?: unknown;
  notes?: string | null;
  lessonLink?: string | null;
  materials?: unknown;
  homework?: string | null;
  resources?: unknown;
};

export type DayLessonSkeletonBlock = {
  id: number;
  dayOfWeek: number;
  startTime?: string | null;
  endTime?: string | null;
  blockType?: string | null;
  sortOrder?: number | null;
  defaultTitle?: string | null;
};

/** One child + class row from `GET /api/schedule-builder/parent/my-week-plans`. */
export type DayLessonChildSource = {
  childId: number;
  childName: string;
  classId: number;
  classTitle: string;
  blocks?: DayLessonPlanBlock[] | null;
  skeletonBlocks?: DayLessonSkeletonBlock[] | null;
};

export type DayLessonRow = {
  blockId: number;
  title: string;
  detail: DayLessonDetail;
};

export type DayLessonSection = {
  classId: number;
  classTitle: string;
  lessons: DayLessonRow[];
};

export type DayLessonChild = {
  childId: number;
  childName: string;
  sections: DayLessonSection[];
};

export type DayLessonsForDate = {
  children: DayLessonChild[];
  /** True only when two or more children have lessons that day. */
  showChildChips: boolean;
  lessonCount: number;
};

function formatClock(time: string | null | undefined): string {
  if (!time) return "";
  const match = String(time).trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) return String(time);
  const hours = Number(match[1]);
  const minutes = match[2];
  const suffix = hours >= 12 ? "PM" : "AM";
  const hour12 = hours % 12 || 12;
  return `${hour12}:${minutes} ${suffix}`;
}

function timeLabel(date: Date, start?: string | null, end?: string | null): string | undefined {
  const day = date.toLocaleDateString("en-US", { weekday: "long" });
  const startLabel = formatClock(start);
  const endLabel = formatClock(end);
  if (!startLabel) return day;
  if (!endLabel) return `${day} · ${startLabel}`;
  return `${day} · ${startLabel} – ${endLabel}`;
}

function countLessons(children: DayLessonChild[]): number {
  return children.reduce(
    (total, child) =>
      total + child.sections.reduce((sectionTotal, section) => sectionTotal + section.lessons.length, 0),
    0,
  );
}

/**
 * Published week-plan lessons for one calendar day, grouped by child then class.
 * Skeleton `dayOfWeek` is Sunday = 0, matching `Date#getDay()`.
 * A row title is the lesson title only — class, campus, and term stay on the section.
 */
export function groupDayLessons(
  sources: DayLessonChildSource[],
  date: Date,
  options?: { childId?: number | null },
): DayLessonsForDate {
  const weekday = date.getDay();
  const childFilter = options?.childId;
  const filtered =
    childFilter == null || Number.isNaN(childFilter)
      ? sources
      : sources.filter((source) => source.childId === childFilter);

  const byChild = new Map<number, DayLessonChild>();

  for (const source of filtered) {
    const slots = [...(source.skeletonBlocks ?? [])]
      .filter((slot) => Number(slot.dayOfWeek) === weekday)
      .sort((a, b) => {
        const order = (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0);
        if (order !== 0) return order;
        return (a.startTime ?? "").localeCompare(b.startTime ?? "");
      });

    const lessons: DayLessonRow[] = [];
    for (const slot of slots) {
      const plan = (source.blocks ?? []).find(
        (block) => Number(block.skeletonBlockId) === Number(slot.id),
      );
      if (!plan) continue;
      const title = (plan.title || slot.defaultTitle || "Lesson").trim() || "Lesson";
      lessons.push({
        blockId: plan.id,
        title,
        detail: {
          title,
          description: plan.description,
          blockType: plan.blockType || slot.blockType || "flexible",
          isCompleted: plan.isCompleted === true,
          objectives: plan.objectives,
          groups: plan.groups,
          notes: plan.notes,
          lessonLink: plan.lessonLink,
          materials: plan.materials,
          homework: plan.homework,
          resources: plan.resources,
          timeLabel: timeLabel(date, slot.startTime, slot.endTime),
        },
      });
    }

    if (lessons.length === 0) continue;

    let child = byChild.get(source.childId);
    if (!child) {
      child = {
        childId: source.childId,
        childName: source.childName,
        sections: [],
      };
      byChild.set(source.childId, child);
    }

    const existing = child.sections.find((section) => section.classId === source.classId);
    if (existing) {
      existing.lessons.push(...lessons);
    } else {
      child.sections.push({
        classId: source.classId,
        classTitle: source.classTitle,
        lessons,
      });
    }
  }

  const children = Array.from(byChild.values());
  return {
    children,
    showChildChips: children.length > 1,
    lessonCount: countLessons(children),
  };
}
