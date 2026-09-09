import { Badge } from "@/components/ui/badge";

type PlacementLevelsStripProps = {
  currentLexileRange?: string | null;
  currentReadingGradeLevel?: string | null;
  currentMathLevel?: string | null;
};

export function PlacementLevelsStrip({
  currentLexileRange,
  currentReadingGradeLevel,
  currentMathLevel,
}: PlacementLevelsStripProps) {
  const hasReading = Boolean(currentLexileRange?.trim() || currentReadingGradeLevel?.trim());
  const hasMath = Boolean(currentMathLevel?.trim());

  if (!hasReading && !hasMath) return null;

  return (
    <div
      className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 p-3"
      data-testid="parent-placement-levels"
      aria-label="Current placement levels"
    >
      <span className="text-sm font-medium">Current placement</span>
      {hasReading && (
        <Badge
          variant="outline"
          className="bg-blue-50 text-blue-700"
          data-testid="badge-parent-lexile"
        >
          {currentLexileRange?.trim() ? `Lexile ${currentLexileRange.trim()}` : "Lexile not set"}
          {currentReadingGradeLevel?.trim()
            ? ` · Reading grade ${currentReadingGradeLevel.trim()}`
            : ""}
        </Badge>
      )}
      {hasMath && (
        <Badge
          variant="outline"
          className="bg-emerald-50 text-emerald-700"
          data-testid="badge-parent-math-level"
        >
          Math level {currentMathLevel!.trim()}
        </Badge>
      )}
    </div>
  );
}
