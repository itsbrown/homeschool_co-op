import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { BookOpenCheck, Calculator } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

export type StudentLevels = {
  currentLexileRange?: string | null;
  currentReadingGradeLevel?: string | null;
  currentMathLevel?: string | null;
};

type Props = StudentLevels & {
  childId: number;
  childName: string;
  classId?: number | string;
};

async function parseError(response: Response, fallback: string) {
  const body = await response.json().catch(() => null);
  return body?.message || fallback;
}

export function StudentLevelChips({
  currentLexileRange,
  currentReadingGradeLevel,
  currentMathLevel,
}: StudentLevels) {
  if (!currentLexileRange && !currentReadingGradeLevel && !currentMathLevel) return null;

  return (
    <div className="mt-1.5 flex flex-wrap gap-1" data-testid="student-level-chips">
      {(currentLexileRange || currentReadingGradeLevel) && (
        <Badge variant="secondary" className="font-normal">
          Reading: {[currentReadingGradeLevel, currentLexileRange].filter(Boolean).join(" · ")}
        </Badge>
      )}
      {currentMathLevel && (
        <Badge variant="outline" className="font-normal">
          Math: {currentMathLevel}
        </Badge>
      )}
    </div>
  );
}

export default function StudentLevelsSheet({
  childId,
  childName,
  classId,
  currentLexileRange,
  currentReadingGradeLevel,
  currentMathLevel,
}: Props) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [readingGradeLevel, setReadingGradeLevel] = useState(currentReadingGradeLevel ?? "");
  const [lexileRange, setLexileRange] = useState(currentLexileRange ?? "");
  const [mathLevel, setMathLevel] = useState(currentMathLevel ?? "");
  const [notes, setNotes] = useState("");

  const resetFields = () => {
    setReadingGradeLevel(currentReadingGradeLevel ?? "");
    setLexileRange(currentLexileRange ?? "");
    setMathLevel(currentMathLevel ?? "");
    setNotes("");
  };

  const mutation = useMutation({
    mutationFn: async () => {
      const readingGrade = readingGradeLevel.trim();
      const lexile = lexileRange.trim();
      const math = mathLevel.trim();
      const entryNotes = notes.trim() || undefined;

      if (!readingGrade && !lexile && !math) {
        throw new Error("Enter a reading or math level before saving.");
      }

      const saves: Promise<Response>[] = [];
      if (readingGrade || lexile) {
        saves.push(
          apiRequest("POST", "/api/lexile/entry", {
            childId,
            readingGradeLevel: readingGrade || undefined,
            lexileRange: lexile || undefined,
            notes: entryNotes,
          }),
        );
      }
      if (math) {
        saves.push(
          apiRequest("POST", "/api/math-level/entry", {
            childId,
            mathLevel: math,
            notes: entryNotes,
          }),
        );
      }

      const responses = await Promise.all(saves);
      for (const response of responses) {
        if (!response.ok) {
          throw new Error(await parseError(response, "Failed to save student levels."));
        }
      }
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/educator/my-students"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/lexile/students"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/math-level/students"] }),
        ...(classId
          ? [
              queryClient.invalidateQueries({
                queryKey: [`/api/educator/classes/${classId}/students`],
              }),
            ]
          : []),
      ]);
      toast({
        title: "Student levels saved",
        description: `Reading and math levels for ${childName} are up to date.`,
      });
      setOpen(false);
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Could not save levels", description: error.message });
    },
  });

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) resetFields();
    setOpen(nextOpen);
  };

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetTrigger asChild>
        <Button type="button" size="sm" variant="outline" data-testid="button-open-student-levels">
          <BookOpenCheck className="mr-1 h-3.5 w-3.5" />
          Levels
        </Button>
      </SheetTrigger>
      <SheetContent
        side="right"
        className="w-full overflow-y-auto sm:max-w-md"
        data-testid="student-levels-sheet"
      >
        <SheetHeader className="text-left">
          <SheetTitle>Levels for {childName}</SheetTitle>
          <SheetDescription>
            Record the student's current reading and math placement.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          <section className="space-y-3">
            <div className="flex items-center gap-2 font-medium">
              <BookOpenCheck className="h-4 w-4 text-blue-600" />
              Lexile
            </div>
            <div className="space-y-2">
              <Label htmlFor={`sheet-reading-grade-${childId}`}>Reading grade level</Label>
              <Input
                id={`sheet-reading-grade-${childId}`}
                value={readingGradeLevel}
                onChange={(event) => setReadingGradeLevel(event.target.value)}
                placeholder="Example: Grade 4"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`sheet-lexile-range-${childId}`}>Lexile range</Label>
              <Input
                id={`sheet-lexile-range-${childId}`}
                value={lexileRange}
                onChange={(event) => setLexileRange(event.target.value)}
                placeholder="Example: 600L–700L"
                data-testid="input-sheet-lexile-range"
              />
            </div>
          </section>

          <section className="space-y-3">
            <div className="flex items-center gap-2 font-medium">
              <Calculator className="h-4 w-4 text-emerald-600" />
              Math Level
            </div>
            <div className="space-y-2">
              <Label htmlFor={`sheet-math-level-${childId}`}>Current math level</Label>
              <Input
                id={`sheet-math-level-${childId}`}
                value={mathLevel}
                onChange={(event) => setMathLevel(event.target.value)}
                placeholder="Example: 3A"
                data-testid="input-sheet-math-level"
              />
            </div>
          </section>

          <div className="space-y-2">
            <Label htmlFor={`sheet-level-notes-${childId}`}>Notes (optional)</Label>
            <Textarea
              id={`sheet-level-notes-${childId}`}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Add context about placement or the assessment."
              rows={4}
            />
          </div>
        </div>

        <SheetFooter className="mt-6">
          <Button
            type="button"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
            data-testid="button-save-student-levels"
          >
            {mutation.isPending ? "Saving…" : "Save levels"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
