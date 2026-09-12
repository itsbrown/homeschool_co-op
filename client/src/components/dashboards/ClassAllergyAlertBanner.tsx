import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { classroomAllergyReminderCopy } from "@shared/class-allergy-alerts";
import { AlertTriangle } from "lucide-react";
import type { ParentClassAllergyAlert } from "@/lib/parent-class-allergy-alerts";

export function ClassAllergyAlertBanner({
  alerts,
  classId,
}: {
  alerts: ParentClassAllergyAlert[] | undefined;
  classId?: number;
}) {
  const visible = (alerts ?? []).filter((alert) =>
    classId == null ? true : alert.classId === classId,
  );
  if (visible.length === 0) return null;

  return (
    <div className="space-y-3" data-testid="dashboard-class-allergy-alerts">
      {visible.map((alert) => {
        const copy = classroomAllergyReminderCopy(alert.className, alert.allergens);
        return (
          <Alert
            key={alert.classId}
            className="border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-50"
            data-testid={`class-allergy-alert-${alert.classId}`}
          >
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>{copy.bannerTitle}</AlertTitle>
            <AlertDescription>{copy.bannerBody}</AlertDescription>
          </Alert>
        );
      })}
    </div>
  );
}
