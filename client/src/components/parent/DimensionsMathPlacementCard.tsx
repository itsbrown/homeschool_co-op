import { useState } from "react";
import { BookOpen, ChevronDown, ExternalLink } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { DIMENSIONS_MATH_PLACEMENT_TESTS_URL } from "@shared/supply-list";

const PLACEMENT_STEPS = [
  {
    title: "Start lower than you think",
    body: "A 1st or 2nd grader usually begins with 1A or 1B. Dimensions Math levels are not the same as school grades.",
  },
  {
    title: "Let your child work independently",
    body: "The test is untimed. Plan about an hour. Stop when the work becomes too hard.",
  },
  {
    title: "Buy the textbook and workbook for the level they start struggling",
    body: "If 2A felt fine but 2B was a struggle, start with 2B.",
  },
  {
    title: "Grades 6–8 have no placement tests",
    body: "If Grade 5 work is solid, start Dimensions Math 6.",
  },
] as const;

function PlacementSteps({ firstStepTestId }: { firstStepTestId?: string }) {
  return (
    <ol className="space-y-3 text-sm">
      {PLACEMENT_STEPS.map((step, index) => (
        <li key={step.title} className="flex gap-3">
          <span
            className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground"
            aria-hidden
          >
            {index + 1}
          </span>
          <div>
            <p
              className="font-medium"
              data-testid={index === 0 ? firstStepTestId : undefined}
            >
              {step.title}
            </p>
            <p className="text-muted-foreground mt-0.5">{step.body}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

export function DimensionsMathPlacementCard() {
  const [open, setOpen] = useState(false);

  return (
    <Card
      className="border-primary/20 bg-primary/5 print:bg-white print:border-border"
      data-testid="dimensions-math-placement"
    >
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <BookOpen className="h-5 w-5 shrink-0" aria-hidden />
          Before you buy Dimensions Math
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Take a placement test first. Levels do not match school grades.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button asChild className="min-h-11">
          <a
            href={DIMENSIONS_MATH_PLACEMENT_TESTS_URL}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="dimensions-math-placement-link"
          >
            Open placement tests
            <span className="sr-only"> (opens in a new tab)</span>
            <ExternalLink className="ml-2 h-4 w-4" aria-hidden />
          </a>
        </Button>

        <div className="hidden print:block">
          <PlacementSteps />
        </div>

        <Collapsible open={open} onOpenChange={setOpen} className="print:hidden">
          <CollapsibleTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              className="min-h-11 w-full justify-between px-2"
              data-testid="dimensions-math-placement-howto"
            >
              How to take the test
              <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform", open && "rotate-180")} />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-1 pb-1">
            <PlacementSteps firstStepTestId="dimensions-math-placement-howto-step-1" />
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
}
