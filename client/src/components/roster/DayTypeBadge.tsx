import { Badge } from "@/components/ui/badge";
import { rosterDayTypeLabel, type RosterDayType } from "@shared/roster-day-type";

const BADGE_CLASS: Record<RosterDayType, string> = {
  full_day: "bg-blue-100 text-blue-800 border-blue-200",
  half_day: "bg-amber-100 text-amber-800 border-amber-200",
};

export function DayTypeBadge({
  dayType,
  testId,
}: {
  dayType?: string | null;
  testId?: string;
}) {
  if (dayType !== "half_day" && dayType !== "full_day") {
    return <span className="text-muted-foreground text-sm">—</span>;
  }
  return (
    <Badge variant="outline" className={BADGE_CLASS[dayType]} data-testid={testId}>
      {rosterDayTypeLabel(dayType)}
    </Badge>
  );
}
