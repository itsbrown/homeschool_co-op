import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { formatClassDay, groupByPerson, shiftClassDay } from "@shared/payroll-day";

type Line = {
  jobId: number;
  personName: string;
  jobLabel: string;
  present: "here" | "away";
  differentHours: number | null;
  note: string;
};

type DayPayload = {
  date: string;
  saved: boolean;
  note: string;
  lines: Line[];
};

export default function PayrollDayPage() {
  const [date, setDate] = useState<string | null>(null);
  const [draft, setDraft] = useState<DayPayload | null>(null);
  const [savedMessage, setSavedMessage] = useState(false);
  const [openHours, setOpenHours] = useState<number | null>(null);
  const [openNote, setOpenNote] = useState<number | null>(null);

  const queryDate = date ?? "";
  const { data, isLoading, error } = useQuery<DayPayload>({
    queryKey: [queryDate ? `/api/payroll-day?date=${queryDate}` : "/api/payroll-day"],
  });

  const view = draft && draft.date === (date ?? data?.date) ? draft : data ?? null;

  const save = useMutation({
    mutationFn: async (payload: DayPayload) => {
      const response = await apiRequest("POST", "/api/payroll-day", {
        date: payload.date,
        note: payload.note,
        lines: payload.lines.map((line) => ({
          jobId: line.jobId,
          present: line.present,
          differentHours: line.differentHours,
          note: line.note,
        })),
      });
      if (!response.ok) throw new Error("save failed");
    },
    onSuccess: () => {
      setSavedMessage(true);
      queryClient.invalidateQueries({
        predicate: (query) => String(query.queryKey[0] ?? "").startsWith("/api/payroll-day"),
      });
    },
  });

  if (isLoading && !view) {
    return <p className="p-6 text-lg">Opening today…</p>;
  }
  if (error || !view) {
    return (
      <p className="p-6 text-lg" data-testid="payroll-day-denied">
        You do not have access to daily hours.
      </p>
    );
  }

  const groups = groupByPerson(view.lines);
  const update = (jobId: number, patch: Partial<Line>) => {
    setSavedMessage(false);
    setDraft({
      ...view,
      lines: view.lines.map((line) => (line.jobId === jobId ? { ...line, ...patch } : line)),
    });
    if (!date) setDate(view.date);
  };

  return (
    <div className="mx-auto max-w-lg px-4 pb-28 pt-6">
      <div className="mb-4 flex items-center justify-between gap-2">
        <Button type="button" variant="outline" onClick={() => { setDate(shiftClassDay(view.date, -1)); setDraft(null); }}>
          Earlier
        </Button>
        <h1 className="text-center text-xl font-medium" data-testid="payroll-day-title">
          {formatClassDay(view.date)}
        </h1>
        <Button type="button" variant="outline" onClick={() => { setDate(shiftClassDay(view.date, 1)); setDraft(null); }}>
          Later
        </Button>
      </div>
      <p className="mb-4 text-sm text-muted-foreground">Already filled in. Change only what was different today.</p>
      <label className="mb-6 block text-base">
        Anything unusual today?
        <Textarea
          className="mt-2"
          value={view.note}
          data-testid="payroll-day-note"
          onChange={(event) => {
            setSavedMessage(false);
            setDraft({ ...view, note: event.target.value });
            if (!date) setDate(view.date);
          }}
        />
      </label>
      {groups.map((group) => (
        <section key={group.personName} className="mb-6 border-b pb-4">
          <h2 className="mb-3 text-lg font-medium">{group.personName}</h2>
          {group.jobs.map((job) => (
            <div key={job.jobId} className="mb-4" data-testid={`payroll-job-${job.jobId}`}>
              <p className="mb-2">{job.jobLabel}</p>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  className="h-12"
                  variant={job.present === "here" ? "default" : "outline"}
                  data-testid={`here-${job.jobId}`}
                  onClick={() => update(job.jobId, { present: "here" })}
                >
                  Here
                </Button>
                <Button
                  type="button"
                  className="h-12"
                  variant={job.present === "away" ? "default" : "outline"}
                  data-testid={`away-${job.jobId}`}
                  onClick={() => update(job.jobId, { present: "away" })}
                >
                  Not here
                </Button>
              </div>
              <button type="button" className="mt-2 text-sm underline" onClick={() => setOpenHours(openHours === job.jobId ? null : job.jobId)}>
                Different hours
              </button>
              {openHours === job.jobId && (
                <Input
                  className="mt-2 h-12"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  placeholder="Hours today"
                  data-testid={`hours-${job.jobId}`}
                  value={job.differentHours ?? ""}
                  onChange={(event) => {
                    const raw = event.target.value;
                    update(job.jobId, { differentHours: raw === "" ? null : Number(raw) });
                  }}
                />
              )}
              <button type="button" className="mt-1 block text-sm underline" onClick={() => setOpenNote(openNote === job.jobId ? null : job.jobId)}>
                Note
              </button>
              {openNote === job.jobId && (
                <Textarea
                  className="mt-2"
                  data-testid={`note-${job.jobId}`}
                  value={job.note}
                  onChange={(event) => update(job.jobId, { note: event.target.value })}
                />
              )}
            </div>
          ))}
        </section>
      ))}
      <div className="fixed inset-x-0 bottom-0 border-t bg-background p-4">
        <Button
          type="button"
          className="h-12 w-full text-base"
          disabled={save.isPending}
          data-testid="payroll-day-save"
          onClick={() => save.mutate(view)}
        >
          {save.isPending ? "Saving…" : "Save"}
        </Button>
        {(savedMessage || view.saved) && <p className="mt-2 text-center" data-testid="payroll-day-saved">Saved.</p>}
        {save.isError && <p className="mt-2 text-center text-destructive">Could not save. Try again.</p>}
      </div>
    </div>
  );
}
