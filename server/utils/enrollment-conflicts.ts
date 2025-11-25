import { Class } from '@shared/schema';

export interface TimeSlot {
  day: string;
  startTime: string;
  endTime: string;
}

export interface ScheduleConflict {
  type: 'schedule' | 'inclusion';
  conflictingClassId: number;
  conflictingClassName: string;
  message: string;
  details?: {
    day?: string;
    time?: string;
  };
}

export function parseClassSchedule(classData: Class): TimeSlot[] {
  const timeSlots: TimeSlot[] = [];
  
  if (!classData.schedule) {
    return timeSlots;
  }

  const schedule = classData.schedule as any;

  if (schedule.variants && Array.isArray(schedule.variants)) {
    for (const variant of schedule.variants) {
      if (variant.days && Array.isArray(variant.days) && variant.startTime && variant.endTime) {
        for (const day of variant.days) {
          timeSlots.push({
            day: normalizeDay(day),
            startTime: variant.startTime,
            endTime: variant.endTime,
          });
        }
      }
    }
  }

  return timeSlots;
}

function normalizeDay(day: string): string {
  const dayMap: Record<string, string> = {
    'monday': 'Monday',
    'tuesday': 'Tuesday',
    'wednesday': 'Wednesday',
    'thursday': 'Thursday',
    'friday': 'Friday',
    'saturday': 'Saturday',
    'sunday': 'Sunday',
    'mon': 'Monday',
    'tue': 'Tuesday',
    'wed': 'Wednesday',
    'thu': 'Thursday',
    'fri': 'Friday',
    'sat': 'Saturday',
    'sun': 'Sunday',
  };
  
  const normalized = dayMap[day.toLowerCase()];
  return normalized || day;
}

function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + (minutes || 0);
}

function timeSlotsOverlap(slot1: TimeSlot, slot2: TimeSlot): boolean {
  if (slot1.day !== slot2.day) {
    return false;
  }

  const start1 = timeToMinutes(slot1.startTime);
  const end1 = timeToMinutes(slot1.endTime);
  const start2 = timeToMinutes(slot2.startTime);
  const end2 = timeToMinutes(slot2.endTime);

  return start1 < end2 && start2 < end1;
}

export function detectScheduleConflicts(
  targetClass: Class,
  enrolledClasses: Class[]
): ScheduleConflict[] {
  const conflicts: ScheduleConflict[] = [];
  const targetSlots = parseClassSchedule(targetClass);

  if (targetSlots.length === 0) {
    return conflicts;
  }

  for (const enrolledClass of enrolledClasses) {
    const enrolledSlots = parseClassSchedule(enrolledClass);
    
    for (const targetSlot of targetSlots) {
      for (const enrolledSlot of enrolledSlots) {
        if (timeSlotsOverlap(targetSlot, enrolledSlot)) {
          conflicts.push({
            type: 'schedule',
            conflictingClassId: enrolledClass.id,
            conflictingClassName: enrolledClass.title,
            message: `Cannot enroll - conflicts with ${enrolledClass.title} (${enrolledSlot.day} ${enrolledSlot.startTime}-${enrolledSlot.endTime})`,
            details: {
              day: enrolledSlot.day,
              time: `${enrolledSlot.startTime}-${enrolledSlot.endTime}`,
            },
          });
          break;
        }
      }
    }
  }

  return conflicts;
}

export function detectInclusionConflicts(
  targetClassId: number,
  enrolledClassIds: number[],
  classInclusionsMap: Map<number, number[]>
): ScheduleConflict[] {
  const conflicts: ScheduleConflict[] = [];

  for (const enrolledClassId of enrolledClassIds) {
    const includedClasses = classInclusionsMap.get(enrolledClassId) || [];
    
    if (includedClasses.includes(targetClassId)) {
      conflicts.push({
        type: 'inclusion',
        conflictingClassId: enrolledClassId,
        conflictingClassName: '', // Will be filled by caller
        message: `Already included in enrolled program`,
      });
    }
  }

  return conflicts;
}
