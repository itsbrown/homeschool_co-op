import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { DimensionsMathPlacementCard } from "@/components/parent/DimensionsMathPlacementCard";

export function DimensionsMathBooksSection({
  bookCount,
  needsPlacement,
  showPlacementCard,
  children,
}: {
  bookCount: number;
  needsPlacement: boolean;
  showPlacementCard: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(true);
  const bookLabel = `${bookCount} book${bookCount === 1 ? "" : "s"}`;
  const summary = needsPlacement ? `${bookLabel} · placement test before you buy` : bookLabel;

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="space-y-3" data-testid="dimensions-math-books">
      <CollapsibleTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          className="min-h-11 w-full justify-between px-2"
          data-testid="dimensions-math-books-trigger"
        >
          <span className="text-left">
            <span className="font-semibold">Dimensions Math books</span>
            <span className="block text-xs font-normal text-muted-foreground">{summary}</span>
          </span>
          <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform", open && "rotate-180")} />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-4 print:block">
        {showPlacementCard && <DimensionsMathPlacementCard />}
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}
