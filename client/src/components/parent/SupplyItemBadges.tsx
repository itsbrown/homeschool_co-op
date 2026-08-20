import { Badge } from "@/components/ui/badge";
import { needsDimensionsMathPlacementTest } from "@shared/supply-list";

export function SupplyItemBadges({ name, required }: { name: string; required: boolean }) {
  return (
    <>
      <Badge variant={required ? "default" : "secondary"}>{required ? "Required" : "Optional"}</Badge>
      {needsDimensionsMathPlacementTest(name) && (
        <Badge variant="destructive" data-testid="supply-badge-placement-test">
          Placement test
        </Badge>
      )}
    </>
  );
}
