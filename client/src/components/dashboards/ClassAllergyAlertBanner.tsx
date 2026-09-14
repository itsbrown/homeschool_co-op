import { useState } from "react";
import { Link } from "wouter";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  classroomAllergyAdminCopy,
  householdAllergyAlerts,
  householdAllergyCardCopy,
  householdAllergySignature,
} from "@shared/class-allergy-alerts";
import { AlertTriangle } from "lucide-react";
import {
  dismissHouseholdAllergy,
  isHouseholdAllergyDismissed,
  type ParentClassAllergyAlert,
} from "@/lib/parent-class-allergy-alerts";

const amberAlertClass =
  "border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-50";

export function ClassAllergyAlertBanner({
  alerts,
  classId,
  audience = "parent",
  testId = "dashboard-class-allergy-alerts",
}: {
  alerts: ParentClassAllergyAlert[] | undefined;
  classId?: number;
  audience?: "parent" | "admin";
  testId?: string;
}) {
  const visible = (alerts ?? []).filter((alert) =>
    classId == null ? true : alert.classId === classId,
  );
  if (visible.length === 0) return null;

  if (audience === "admin") {
    return (
      <div className="space-y-3" data-testid={testId}>
        {visible.map((alert) => {
          const copy = classroomAllergyAdminCopy(alert.className, alert.allergens);
          return (
            <Alert
              key={alert.classId}
              className={amberAlertClass}
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

  return <HouseholdAllergyCard alerts={householdAllergyAlerts(visible)} testId={testId} />;
}

function HouseholdAllergyCard({
  alerts,
  testId,
}: {
  alerts: ParentClassAllergyAlert[];
  testId: string;
}) {
  const signature = householdAllergySignature(alerts);
  const copy = householdAllergyCardCopy(alerts);
  const [hidden, setHidden] = useState(() => isHouseholdAllergyDismissed(signature));

  if (hidden || copy.rows.length === 0) return null;

  return (
    <div data-testid={testId}>
      <Alert className={`${amberAlertClass} relative pr-4`}>
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>{copy.title}</AlertTitle>
        <AlertDescription className="space-y-3">
          <p>{copy.summary}</p>
          <ul className="space-y-3 text-sm">
            {copy.rows.map((row) => (
              <li key={row.classId} data-testid={`class-allergy-alert-${row.classId}`}>
                <p className="font-medium text-amber-950 dark:text-amber-50">{row.className}</p>
                <p>Do not pack {row.allergenLabel}.</p>
                {row.childrenLabel ? (
                  <p className="text-xs text-amber-900/80 dark:text-amber-100/80">{row.childrenLabel}</p>
                ) : null}
              </li>
            ))}
          </ul>
          <p className="text-xs text-amber-900/80 dark:text-amber-100/80">
            We never share the student&apos;s name.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-9 border-amber-300 bg-white text-amber-950 hover:bg-amber-100"
              data-testid="button-dismiss-class-allergy"
              onClick={() => {
                dismissHouseholdAllergy(signature);
                setHidden(true);
              }}
            >
              Got it
            </Button>
            <Link
              href="/parent/documents"
              className="text-sm font-medium underline underline-offset-2"
              data-testid="link-family-safety-documents"
            >
              Family Safety in Documents
            </Link>
          </div>
        </AlertDescription>
      </Alert>
    </div>
  );
}
