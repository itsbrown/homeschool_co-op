import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Calculator,
  ChevronDown,
  ChevronUp,
  Clock,
  Info,
  Loader2,
  Save,
} from "lucide-react";
import { format } from "date-fns";

interface AssessmentRecord {
  id: number;
  score: string;
  assessmentDate: string;
  notes: string | null;
  source: string;
}

const entrySchema = z.object({
  mathLevel: z.string().trim().min(1, "Math level is required").max(80),
  notes: z.string().max(2000).optional(),
});

type EntryValues = z.infer<typeof entrySchema>;

interface Props {
  childId: number;
  currentMathLevel?: string | null;
  /** When true, show Save form for staff (default true). */
  allowEdit?: boolean;
}

export default function MathLevelProfileSection({
  childId,
  currentMathLevel,
  allowEdit = true,
}: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showHistory, setShowHistory] = useState(false);
  const [showEntry, setShowEntry] = useState(false);

  const hasCurrentData = !!currentMathLevel?.trim();

  const { data: history = [], isLoading: historyLoading } = useQuery<AssessmentRecord[]>({
    queryKey: ["/api/math-level/history", childId],
    enabled: showHistory && !!childId,
    retry: false,
  });

  const form = useForm<EntryValues>({
    resolver: zodResolver(entrySchema),
    defaultValues: {
      mathLevel: currentMathLevel || "",
      notes: "",
    },
  });

  const openEntry = () => {
    const next = !showEntry;
    setShowEntry(next);
    if (next) {
      form.reset({
        mathLevel: currentMathLevel || "",
        notes: "",
      });
    }
  };

  const mutation = useMutation({
    mutationFn: async (data: EntryValues) => {
      const response = await apiRequest("POST", "/api/math-level/entry", {
        childId,
        mathLevel: data.mathLevel,
        notes: data.notes || undefined,
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.message || "Failed to save math level");
      }
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Saved", description: "Math level recorded for this student." });
      queryClient.invalidateQueries({ queryKey: ["/api/math-level/students"] });
      queryClient.invalidateQueries({ queryKey: ["/api/math-level/history", childId] });
      queryClient.invalidateQueries({ queryKey: ["/api/lexile/students"] });
      setShowEntry(false);
      setShowHistory(true);
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Error", description: error.message });
    },
  });

  return (
    <Card data-testid="math-level-profile-section">
      <CardHeader>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="flex items-center gap-2">
            <Calculator className="h-5 w-5 text-emerald-600" />
            Math Level
          </CardTitle>
          {!hasCurrentData && (
            <Badge variant="secondary" className="text-xs">
              No data recorded
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {hasCurrentData ? (
          <div className="flex flex-wrap gap-2">
            <div
              className="flex items-center gap-1.5 bg-emerald-50 text-emerald-800 px-3 py-1.5 rounded-md border border-emerald-200"
              data-testid="badge-current-math-level"
            >
              <Calculator className="h-4 w-4" />
              <span className="text-sm font-medium">Current level: {currentMathLevel}</span>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            <Info className="h-4 w-4" />
            No math level has been recorded for this student yet.
          </p>
        )}

        {allowEdit && (
          <div className="pt-2 border-t">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50 -ml-2"
              onClick={openEntry}
              data-testid="button-toggle-math-level-entry"
            >
              {showEntry ? "Cancel" : hasCurrentData ? "Update math level" : "Enter math level"}
              {showEntry ? (
                <ChevronUp className="h-3 w-3 ml-1" />
              ) : (
                <ChevronDown className="h-3 w-3 ml-1" />
              )}
            </Button>

            {showEntry && (
              <Form {...form}>
                <form
                  onSubmit={form.handleSubmit((data) => mutation.mutate(data))}
                  className="mt-3 space-y-3"
                >
                  <FormField
                    control={form.control}
                    name="mathLevel"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Math level *</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            placeholder="e.g. 3A, 5B, or 4.5"
                            style={{ fontSize: "16px" }}
                            disabled={mutation.isPending}
                            data-testid="input-math-level"
                          />
                        </FormControl>
                        <p className="text-xs text-muted-foreground">
                          Dimensions Math placement (KA–8B) or a grade-equivalent label.
                        </p>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="notes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Notes (optional)</FormLabel>
                        <FormControl>
                          <Textarea
                            {...field}
                            placeholder="Placement test notes, date taken, etc."
                            rows={2}
                            disabled={mutation.isPending}
                            data-testid="input-math-level-notes"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button
                    type="submit"
                    disabled={mutation.isPending}
                    className="bg-emerald-600 hover:bg-emerald-700"
                    data-testid="button-save-math-level"
                  >
                    {mutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving…
                      </>
                    ) : (
                      <>
                        <Save className="h-4 w-4 mr-2" /> Save math level
                      </>
                    )}
                  </Button>
                </form>
              </Form>
            )}
          </div>
        )}

        <div className="pt-2 border-t">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50 -ml-2"
            onClick={() => setShowHistory((v) => !v)}
            data-testid="button-toggle-math-level-history"
          >
            <Clock className="h-4 w-4 mr-2" />
            {showHistory ? "Hide" : "Show"} Assessment History
            {showHistory ? (
              <ChevronUp className="h-3 w-3 ml-1" />
            ) : (
              <ChevronDown className="h-3 w-3 ml-1" />
            )}
          </Button>

          {showHistory && (
            <div className="mt-3">
              {historyLoading && (
                <div className="space-y-2">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              )}

              {!historyLoading && history.length === 0 && (
                <p className="text-sm text-muted-foreground py-2">
                  No math level records found yet.
                </p>
              )}

              {!historyLoading && history.length > 0 && (
                <div className="relative" data-testid="math-level-history-list">
                  <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-emerald-100" />
                  <div className="space-y-3">
                    {history.map((entry) => (
                      <div key={entry.id} className="flex gap-3 pl-9 relative">
                        <div className="absolute left-3 top-2 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-white shadow-sm" />
                        <div className="flex-1 bg-emerald-50 border border-emerald-100 rounded-lg p-3">
                          <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
                            <Badge
                              variant="outline"
                              className="text-xs border-emerald-300 text-emerald-800 bg-white"
                            >
                              Math Level
                            </Badge>
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {format(new Date(entry.assessmentDate), "MMM d, yyyy")}
                            </span>
                          </div>
                          <p className="text-sm font-medium text-emerald-900">{entry.score}</p>
                          {entry.notes && (
                            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                              {entry.notes}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
