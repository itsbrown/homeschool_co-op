export const HALL_KEYS = ["logic", "grammar"] as const;
export type HallKey = (typeof HALL_KEYS)[number];

export type HallSlot = {
  slotKey: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  defaultTitle: string;
  subjectArea?: string;
};

export type HallDefinition = {
  key: HallKey;
  skeletonName: string;
  classTitle: string;
  /** Prod ids for humans only — lookup is by skeleton name + day + startTime. */
  prodSkeletonId: number;
  prodClassId: number;
  slots: HallSlot[];
};

const MON = 1;
const WED = 3;
const FRI = 5;

/** Same 1:00–3:00 MWF clock on Logic #7 and Grammar #8. */
const AFTERNOON_SLOTS: HallSlot[] = [
  { slotKey: "mon-memorization", dayOfWeek: MON, startTime: "13:00", endTime: "13:15", defaultTitle: "Memorization" },
  {
    slotKey: "mon-latin",
    dayOfWeek: MON,
    startTime: "13:15",
    endTime: "14:00",
    defaultTitle: "Foreign language (Latin)",
    subjectArea: "Latin",
  },
  { slotKey: "mon-reset", dayOfWeek: MON, startTime: "14:00", endTime: "14:10", defaultTitle: "Reset — Art of Argument out" },
  {
    slotKey: "mon-aoa",
    dayOfWeek: MON,
    startTime: "14:10",
    endTime: "14:45",
    defaultTitle: "Debate + writing (one fallacy)",
    subjectArea: "Art of Argument",
  },
  { slotKey: "mon-dismiss", dayOfWeek: MON, startTime: "14:45", endTime: "15:00", defaultTitle: "Pack, dismiss" },

  { slotKey: "wed-memorization", dayOfWeek: WED, startTime: "13:00", endTime: "13:15", defaultTitle: "Memorization + one meaning question" },
  {
    slotKey: "wed-science",
    dayOfWeek: WED,
    startTime: "13:15",
    endTime: "14:00",
    defaultTitle: "Science (specimen + notebook)",
    subjectArea: "Science",
  },
  { slotKey: "wed-reset", dayOfWeek: WED, startTime: "14:00", endTime: "14:10", defaultTitle: "Reset — compass or strings" },
  {
    slotKey: "wed-math",
    dayOfWeek: WED,
    startTime: "14:10",
    endTime: "14:45",
    defaultTitle: "Math / astronomy",
    subjectArea: "Math",
  },
  { slotKey: "wed-dismiss", dayOfWeek: WED, startTime: "14:45", endTime: "15:00", defaultTitle: "Pack, dismiss" },

  { slotKey: "fri-memorization", dayOfWeek: FRI, startTime: "13:00", endTime: "13:15", defaultTitle: "Memorization — two students lead" },
  { slotKey: "fri-art", dayOfWeek: FRI, startTime: "13:15", endTime: "14:00", defaultTitle: "Art", subjectArea: "Art" },
  { slotKey: "fri-reset", dayOfWeek: FRI, startTime: "14:00", endTime: "14:10", defaultTitle: "Reset — pocket Constitutions" },
  {
    slotKey: "fri-civics",
    dayOfWeek: FRI,
    startTime: "14:10",
    endTime: "14:45",
    defaultTitle: "Civics / Convention",
    subjectArea: "Civics",
  },
  { slotKey: "fri-dismiss", dayOfWeek: FRI, startTime: "14:45", endTime: "15:00", defaultTitle: "Pack, dismiss" },
];

const SLOT_ALIASES: Record<string, string> = {
  latin: "mon-latin",
  aoa: "mon-aoa",
  science: "wed-science",
  math: "wed-math",
  art: "fri-art",
  civics: "fri-civics",
};

export const HALLS: Record<HallKey, HallDefinition> = {
  logic: {
    key: "logic",
    skeletonName: "Logic Hall | F2026 | Afternoon",
    classTitle: "Logic Hall | Brighton | F2026",
    prodSkeletonId: 7,
    prodClassId: 82,
    slots: AFTERNOON_SLOTS,
  },
  grammar: {
    key: "grammar",
    skeletonName: "Grammar Hall | F2026 | Brighton",
    classTitle: "Grammar Hall | Brighton | F2026",
    prodSkeletonId: 8,
    prodClassId: 84,
    slots: AFTERNOON_SLOTS,
  },
};

export function isHallKey(value: string): value is HallKey {
  return (HALL_KEYS as readonly string[]).includes(value);
}

/** `13:15`, `13:15:00`, `1:15 PM` → `HH:MM`. */
export function normalizeSlotTime(raw: string): string {
  const trimmed = raw.trim();
  const ampm = trimmed.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*([AaPp][Mm])$/);
  if (ampm) {
    let hour = Number(ampm[1]);
    const minute = ampm[2];
    const mer = ampm[3].toLowerCase();
    if (mer === "pm" && hour < 12) hour += 12;
    if (mer === "am" && hour === 12) hour = 0;
    return `${String(hour).padStart(2, "0")}:${minute}`;
  }
  const military = trimmed.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!military) {
    throw new Error(`Unrecognized time "${raw}" (use HH:MM or h:mm AM/PM)`);
  }
  return `${military[1].padStart(2, "0")}:${military[2]}`;
}

export function resolveHallSlot(
  hall: HallKey,
  query: { dayOfWeek: number; startTime: string } | { slotKey: string },
): HallSlot {
  const def = HALLS[hall];
  if ("slotKey" in query) {
    const key = SLOT_ALIASES[query.slotKey] ?? query.slotKey;
    const slot = def.slots.find((s) => s.slotKey === key);
    if (!slot) {
      throw new Error(`Unknown ${hall} slotKey "${query.slotKey}"`);
    }
    return slot;
  }
  const startTime = normalizeSlotTime(query.startTime);
  const slot = def.slots.find((s) => s.dayOfWeek === query.dayOfWeek && s.startTime === startTime);
  if (!slot) {
    throw new Error(`No ${hall} slot for day ${query.dayOfWeek} at ${startTime}`);
  }
  return slot;
}
