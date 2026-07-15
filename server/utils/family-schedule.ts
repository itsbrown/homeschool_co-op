/**
 * Family calendar (/api/schedule) helpers.
 * Class.schedule is jsonb (often { variants: [...] }), not a free-text string.
 */

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export type FamilyScheduleTiming = {
  scheduleDays: number[]; // 0=Sun … 6=Sat
  startTime: string; // HH:MM 24h
  endTime: string;
  scheduleLabel: string;
};

function parseClockToHhMm(raw: unknown, fallback: string): string {
  if (raw == null) return fallback;
  const s = String(raw).trim();
  if (!s) return fallback;

  const ampm = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i);
  if (ampm) {
    let hour = parseInt(ampm[1], 10);
    const minute = ampm[2] ? parseInt(ampm[2], 10) : 0;
    const period = ampm[3].toLowerCase();
    if (period === 'pm' && hour !== 12) hour += 12;
    if (period === 'am' && hour === 12) hour = 0;
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  }

  const twentyFour = s.match(/^(\d{1,2}):(\d{2})$/);
  if (twentyFour) {
    return `${String(parseInt(twentyFour[1], 10)).padStart(2, '0')}:${twentyFour[2]}`;
  }

  const bare = s.match(/^(\d{1,2})(am|pm)$/i);
  if (bare) {
    let hour = parseInt(bare[1], 10);
    const period = bare[2].toLowerCase();
    if (period === 'pm' && hour !== 12) hour += 12;
    if (period === 'am' && hour === 12) hour = 0;
    return `${String(hour).padStart(2, '0')}:00`;
  }

  return fallback;
}

function daysFromNames(names: unknown): number[] {
  if (!Array.isArray(names)) return [];
  const out: number[] = [];
  for (const name of names) {
    const idx = DAY_NAMES.findIndex((d) => d.toLowerCase() === String(name).toLowerCase());
    if (idx >= 0 && !out.includes(idx)) out.push(idx);
  }
  return out;
}

function parseLegacyScheduleString(scheduleStr: string): FamilyScheduleTiming {
  const scheduleMatch = scheduleStr.match(/(\d+)(am|pm)-(\d+)(am|pm)/i);
  let startTime = '09:00';
  let endTime = '12:00';

  if (scheduleMatch) {
    const startHour = parseInt(scheduleMatch[1], 10);
    const startPeriod = scheduleMatch[2].toLowerCase();
    const endHour = parseInt(scheduleMatch[3], 10);
    const endPeriod = scheduleMatch[4].toLowerCase();
    startTime = `${startPeriod === 'pm' && startHour !== 12 ? startHour + 12 : startHour === 12 && startPeriod === 'am' ? 0 : startHour}:00`;
    endTime = `${endPeriod === 'pm' && endHour !== 12 ? endHour + 12 : endHour === 12 && endPeriod === 'am' ? 0 : endHour}:00`;
    startTime = startTime.padStart(5, '0');
    endTime = endTime.padStart(5, '0');
  }

  const scheduleDays: number[] = [];
  DAY_NAMES.forEach((day, index) => {
    if (scheduleStr.toLowerCase().includes(day.toLowerCase())) {
      scheduleDays.push(index);
    }
  });

  return { scheduleDays, startTime, endTime, scheduleLabel: scheduleStr };
}

/**
 * Resolve recurring days/times from class.schedule (string, jsonb object, or variants).
 * When variantId is set, prefer that variant; otherwise first variant / top-level days.
 */
export function extractFamilyScheduleTiming(
  rawSchedule: unknown,
  variantId?: string | number | null,
): FamilyScheduleTiming {
  if (rawSchedule == null || rawSchedule === '') {
    return { scheduleDays: [], startTime: '09:00', endTime: '12:00', scheduleLabel: '' };
  }

  let schedule: any = rawSchedule;
  if (typeof rawSchedule === 'string') {
    const trimmed = rawSchedule.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        schedule = JSON.parse(trimmed);
      } catch {
        return parseLegacyScheduleString(trimmed);
      }
    } else {
      return parseLegacyScheduleString(trimmed);
    }
  }

  if (typeof schedule !== 'object' || schedule === null) {
    return { scheduleDays: [], startTime: '09:00', endTime: '12:00', scheduleLabel: '' };
  }

  const variants = Array.isArray(schedule.variants) ? schedule.variants : [];
  let variant: any = null;
  if (variants.length > 0) {
    if (variantId != null && String(variantId).length > 0) {
      const want = String(variantId);
      variant =
        variants.find((v: any) => String(v.id) === want) ||
        variants.find((v: any) => v.name === want) ||
        null;
    }
    if (!variant) {
      variant = variants.find((v: any) => v.id === 'default-variant') || variants[0];
    }
  }

  if (variant) {
    const days = daysFromNames(variant.days || variant.daysOfWeek || []);
    return {
      scheduleDays: days,
      startTime: parseClockToHhMm(variant.startTime ?? variant.start_time, '09:00'),
      endTime: parseClockToHhMm(variant.endTime ?? variant.end_time, '12:00'),
      scheduleLabel: variant.name || 'Class',
    };
  }

  const topDays = daysFromNames(schedule.days || schedule.daysOfWeek || schedule.sessionDays || []);
  return {
    scheduleDays: topDays,
    startTime: parseClockToHhMm(schedule.startTime ?? schedule.start_time, '09:00'),
    endTime: parseClockToHhMm(schedule.endTime ?? schedule.end_time, '12:00'),
    scheduleLabel: typeof schedule.label === 'string' ? schedule.label : '',
  };
}
