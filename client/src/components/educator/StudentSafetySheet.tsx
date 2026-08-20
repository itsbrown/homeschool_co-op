import { Phone, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { EducatorStudentSafety } from "@shared/educator-student-safety";

export type StudentSafetyProfile = EducatorStudentSafety & {
  childId: number;
  firstName: string;
  lastName: string;
};

function telHref(phone: string) {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}

export function StudentSafetyBadges({
  student,
  onOpen,
}: {
  student: Pick<
    StudentSafetyProfile,
    "childId" | "hasAllergyAlert" | "hasMedicalAlert" | "hasSpecialNeedsAlert"
  >;
  onOpen: () => void;
}) {
  const hasAlert =
    student.hasAllergyAlert || student.hasMedicalAlert || student.hasSpecialNeedsAlert;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {student.hasAllergyAlert && (
        <Badge
          variant="outline"
          className="bg-red-50 text-red-800 border-red-200"
          data-testid={`badge-allergy-${student.childId}`}
        >
          Allergy
        </Badge>
      )}
      {student.hasMedicalAlert && (
        <Badge
          variant="outline"
          className="bg-amber-50 text-amber-900 border-amber-200"
          data-testid={`badge-medical-${student.childId}`}
        >
          Medical
        </Badge>
      )}
      {student.hasSpecialNeedsAlert && (
        <Badge
          variant="outline"
          className="bg-blue-50 text-blue-800 border-blue-200"
          data-testid={`badge-needs-${student.childId}`}
        >
          Needs
        </Badge>
      )}
      <Button
        type="button"
        size="sm"
        variant={hasAlert ? "outline" : "ghost"}
        className="h-11 min-h-11 px-3"
        onClick={onOpen}
        data-testid={`button-student-safety-${student.childId}`}
      >
        <ShieldAlert className="h-4 w-4 mr-1" />
        Info
      </Button>
    </div>
  );
}

export function StudentSafetySheet({
  student,
  open,
  onOpenChange,
}: {
  student: StudentSafetyProfile | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto rounded-t-xl">
        <SheetHeader className="text-left">
          <SheetTitle data-testid="student-safety-sheet-title">
            {student ? `${student.firstName} ${student.lastName}` : "Student"}
          </SheetTitle>
          <SheetDescription>Allergies, medical notes, and who to call.</SheetDescription>
        </SheetHeader>
        {student && (
          <div className="mt-4 space-y-4 text-sm" data-testid="student-safety-sheet">
            <SafetyBlock label="Allergies" value={student.allergies} alert={student.hasAllergyAlert} />
            <SafetyBlock label="Medical" value={student.medicalInfo} alert={student.hasMedicalAlert} />
            <SafetyBlock
              label="Supports / needs"
              value={student.specialNeeds}
              alert={student.hasSpecialNeedsAlert}
            />
            <div>
              <p className="font-medium">Emergency contact</p>
              {student.emergencyContactName ? (
                <p data-testid="student-safety-emergency-name">{student.emergencyContactName}</p>
              ) : (
                <p className="text-muted-foreground">No emergency contact on file</p>
              )}
              {student.emergencyContactRelationship && (
                <p className="text-muted-foreground">{student.emergencyContactRelationship}</p>
              )}
              {student.emergencyContactPhone && (
                <Button asChild variant="outline" className="mt-2 h-11 min-h-11">
                  <a
                    href={telHref(student.emergencyContactPhone)}
                    data-testid="student-safety-emergency-phone"
                  >
                    <Phone className="h-4 w-4 mr-2" />
                    {student.emergencyContactPhone}
                  </a>
                </Button>
              )}
            </div>
            {student.parentPhone && (
              <div>
                <p className="font-medium">Parent</p>
                <Button asChild variant="outline" className="mt-2 h-11 min-h-11">
                  <a href={telHref(student.parentPhone)} data-testid="student-safety-parent-phone">
                    <Phone className="h-4 w-4 mr-2" />
                    {student.parentPhone}
                  </a>
                </Button>
              </div>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function SafetyBlock({
  label,
  value,
  alert,
}: {
  label: string;
  value: string | null;
  alert: boolean;
}) {
  return (
    <div>
      <p className="font-medium">{label}</p>
      <p className={alert ? "text-red-800" : "text-muted-foreground"}>{value || "None listed"}</p>
    </div>
  );
}
