import { storage } from "../storage";
import { extractFamilyScheduleTiming } from "../utils/family-schedule";

export type FamilyClassScheduleEvent = {
  id: string;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  type: "class";
  childId: string;
  childName: string;
  color: string;
  description: string;
  programName: string;
  instructorName: string;
  schedule: unknown;
};

export async function buildFamilyClassScheduleEvents(opts: {
  children: Array<{ id: number; firstName?: string | null; lastName?: string | null }>;
  childIdFilter?: string;
}): Promise<FamilyClassScheduleEvent[]> {
  const { children, childIdFilter } = opts;
  if (children.length === 0) return [];

  let allEnrollments: any[] = [];

  if (childIdFilter && childIdFilter !== "all") {
    const childId = parseInt(childIdFilter, 10);
    if (!Number.isNaN(childId)) {
      const enrollments = await storage.getEnrollmentsByChildId(childId);
      const child = children.find((c) => c.id === childId);
      allEnrollments = enrollments.map((e: any) => ({
        ...e,
        childId,
        childName: `${child?.firstName ?? ""} ${child?.lastName ?? ""}`.trim(),
      }));
    }
  } else {
    for (const child of children) {
      const enrollments = await storage.getEnrollmentsByChildId(child.id);
      allEnrollments.push(
        ...enrollments.map((e: any) => ({
          ...e,
          childId: child.id,
          childName: `${child.firstName ?? ""} ${child.lastName ?? ""}`.trim(),
        })),
      );
    }
  }

  const activeEnrollments = allEnrollments.filter((e) => e.status === "enrolled");

  const scheduleEvents = await Promise.all(
    activeEnrollments.map(async (enrollment) => {
      try {
        const classId =
          enrollment.marketplaceClassId ?? enrollment.classId ?? enrollment.programId;
        if (classId == null) return null;
        const classDetails = await storage.getClassById(classId);
        if (!classDetails) return null;

        const { scheduleDays, startTime, endTime, scheduleLabel } = extractFamilyScheduleTiming(
          classDetails.schedule,
          enrollment.variantId,
        );
        if (scheduleDays.length === 0) return null;

        const events: FamilyClassScheduleEvent[] = [];
        const startDateObj = new Date(classDetails.startDate || new Date());
        const endDateObj = classDetails.endDate
          ? new Date(classDetails.endDate)
          : (() => {
              const d = new Date(startDateObj);
              d.setMonth(d.getMonth() + 3);
              return d;
            })();

        const currentDate = new Date(startDateObj);
        currentDate.setHours(12, 0, 0, 0);
        endDateObj.setHours(23, 59, 59, 999);

        while (currentDate <= endDateObj) {
          if (scheduleDays.includes(currentDate.getDay())) {
            events.push({
              id: `enrollment-${enrollment.id}-${classDetails.id}-${currentDate.toISOString().slice(0, 10)}`,
              title: classDetails.title || enrollment.className,
              date: currentDate.toISOString().split("T")[0],
              startTime,
              endTime,
              location: classDetails.location || "Location TBD",
              type: "class",
              childId: enrollment.childId.toString(),
              childName: enrollment.childName,
              color: "#3b82f6",
              description: classDetails.description || "",
              programName: classDetails.title,
              instructorName: (classDetails as any).instructorName || "TBD",
              schedule: scheduleLabel || classDetails.schedule,
            });
          }
          currentDate.setDate(currentDate.getDate() + 1);
        }

        return events;
      } catch (enrollmentErr) {
        console.error(
          `Failed to build schedule events for enrollment ${enrollment.id}:`,
          enrollmentErr,
        );
        return null;
      }
    }),
  );

  return scheduleEvents.flat().filter(Boolean) as FamilyClassScheduleEvent[];
}
