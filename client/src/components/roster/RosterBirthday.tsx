import { ageFromBirthdate, formatBirthdayDisplay } from "@shared/student-birthday";

export function RosterBirthday({
  birthdate,
  testId,
  compact = false,
}: {
  birthdate?: string | Date | null;
  testId?: string;
  compact?: boolean;
}) {
  const label = formatBirthdayDisplay(birthdate);
  if (!label) {
    if (compact) return null;
    return (
      <span className="text-muted-foreground text-sm" data-testid={testId}>
        —
      </span>
    );
  }
  const age = ageFromBirthdate(birthdate);
  if (compact) {
    return (
      <div className="text-xs text-muted-foreground" data-testid={testId}>
        {label}
        {age != null ? ` · Age ${age}` : ""}
      </div>
    );
  }
  return (
    <div className="text-sm" data-testid={testId}>
      <div>{label}</div>
      {age != null && (
        <div className="text-muted-foreground">Age {age}</div>
      )}
    </div>
  );
}
