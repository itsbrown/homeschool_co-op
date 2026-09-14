import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  classroomAllergyChipLabel,
  formatAllergenList,
  formatAllergenWithExamples,
  namedClassroomAllergens,
} from "@shared/class-allergy-alerts";
import type { ParentClassAllergyAlert } from "@/lib/parent-class-allergy-alerts";

export function ClassAllergyRestrictionChip({
  alerts,
  classId,
  testId = "class-allergy-restriction-chip",
}: {
  alerts: ParentClassAllergyAlert[] | undefined;
  classId: number;
  testId?: string;
}) {
  const alert = (alerts ?? []).find((item) => item.classId === classId);
  if (!alert) return null;

  const label = classroomAllergyChipLabel(alert.allergens);

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant="outline"
            className="shrink-0 border-amber-300 bg-amber-100 text-amber-950 hover:bg-amber-100"
            data-testid={testId}
          >
            {label}
          </Badge>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">
          Please do not pack {formatAllergenList(namedClassroomAllergens(alert.allergens).map((item) => formatAllergenWithExamples(item))) || "those foods"}.
          We never share the student&apos;s name.
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
