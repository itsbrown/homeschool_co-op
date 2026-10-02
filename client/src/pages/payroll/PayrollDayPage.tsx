import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Check, Pencil } from "lucide-react";
import { formatClassDay, formatClassDayShort, groupByPerson } from "@shared/payroll-day";
import { cn } from "@/lib/utils";

type DayRow = {
  date: string;
  status: "approved" | "needs_review";
  isFocus: boolean;
  jobCount: number;
  hereCount: number;
  awayCount: number;
  hasNote: boolean;
};

type DaysPayload = {
  focus: string;
  days: DayRow[];
};

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
  const [editDate, setEditDate] = useState<string | null>(null);
  const [draft, setDraft] = useState<DayPayload | null>(null);
  const [openHours, setOpenHours] = useState<number | null>(null);
  const [openNote, setOpenNote] = useState<number | null>(null);
  const [approvingDate, setApprovingDate] = useState<string | null>(null);

  const { data: daysData, isLoading, error } = useQuery<DaysPayload>({
    queryKey: ["/api/payroll-day/days"],
  });

  const { data: dayDetail, isLoading: dayLoading } = useQuery<DayPayload>({
    queryKey: [`/api/payroll-day?date=${editDate}`],
    enabled: Boolean(editDate),
  });

  const view =
    editDate && draft && draft.date === editDate
      ? draft
      : editDate && dayDetail && dayDetail.date === editDate
        ? dayDetail
        : null;

  const approve = useMutation({
    mutationFn: async (date: string) => {
      setApprovingDate(date);
      const response = await apiRequest("POST", "/api/payroll-day/approve", { date });
      if (!response.ok) throw new Error("approve failed");
    },
    onSettled: () => setApprovingDate(null),
    onSuccess: () => {
      queryClient.invalidateQueries({
        predicate: (query) => String(query.queryKey[0] ?? "").startsWith("/api/payroll-day"),
      });
    },
  });

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
      setDraft(null);
      setEditDate(null);
      setOpenHours(null);
      setOpenNote(null);
      queryClient.invalidateQueries({
        predicate: (query) => String(query.queryKey[0] ?? "").startsWith("/api/payroll-day"),
      });
    },
  });

  if (isLoading) {
    return <p className="p-6 text-lg">Opening class days…</p>;
  }
  if (error || !daysData) {
    return (
      <p className="p-6 text-lg" data-testid="payroll-day-denied">
        You do not have access to daily hours.
      </p>
    );
  }

  const update = (jobId: number, patch: Partial<Line>) => {
    if (!view) return;
    setDraft({
      ...view,
      lines: view.lines.map((line) => (line.jobId === jobId ? { ...line, ...patch } : line)),
    });
  };

  const groups = view ? groupByPerson(view.lines) : [];

  return (
    <div className="mx-auto max-w-2xl px-4 py-6" data-testid="payroll-day-list">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight" data-testid="payroll-day-title">
          Today&apos;s hours
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Approve a day when everyone worked as usual. Edit when someone was away or hours changed.
        </p>
      </header>

      <ul className="space-y-3">
        {daysData.days.map((day) => {
          const approved = day.status === "approved";
          const summary = approved
            ? day.awayCount > 0
              ? `${day.hereCount} here · ${day.awayCount} away`
              : `${day.jobCount} here`
            : day.jobCount > 0
              ? `${day.jobCount} people · usual hours`
              : "No jobs set up yet";

          return (
            <li
              key={day.date}
              className={cn(
                "rounded-lg border bg-white p-4 shadow-sm",
                day.isFocus && "border-primary/40 ring-1 ring-primary/20",
              )}
              data-testid={`payroll-day-row-${day.date}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-base font-medium">{formatClassDay(day.date)}</p>
                    {day.isFocus && (
                      <Badge variant="secondary" className="font-normal">
                        Next up
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">{summary}</p>
                  {day.hasNote && (
                    <p className="text-xs text-muted-foreground">Includes a note</p>
                  )}
                </div>
                <Badge
                  className={cn(
                    "shrink-0 font-normal",
                    approved
                      ? "bg-green-100 text-green-800 hover:bg-green-100"
                      : "bg-yellow-100 text-yellow-800 hover:bg-yellow-100",
                  )}
                  data-testid={`payroll-day-status-${day.date}`}
                >
                  {approved ? "Approved" : "Needs review"}
                </Badge>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {!approved && (
                  <Button
                    type="button"
                    className="h-11 min-w-[7.5rem]"
                    disabled={approve.isPending}
                    data-testid={`payroll-day-approve-${day.date}`}
                    onClick={() => approve.mutate(day.date)}
                  >
                    <Check className="mr-1.5 h-4 w-4" />
                    {approvingDate === day.date ? "Approving…" : "Approve"}
                  </Button>
                )}
                <Button
                  type="button"
                  variant={approved ? "default" : "outline"}
                  className="h-11 min-w-[7.5rem]"
                  data-testid={`payroll-day-edit-${day.date}`}
                  onClick={() => {
                    setDraft(null);
                    setOpenHours(null);
                    setOpenNote(null);
                    setEditDate(day.date);
                  }}
                >
                  <Pencil className="mr-1.5 h-4 w-4" />
                  Edit
                </Button>
              </div>
            </li>
          );
        })}
      </ul>

      <Sheet
        open={Boolean(editDate)}
        onOpenChange={(open) => {
          if (!open) {
            setEditDate(null);
            setDraft(null);
            setOpenHours(null);
            setOpenNote(null);
          }
        }}
      >
        <SheetContent
          side="bottom"
          className="flex h-[min(92dvh,720px)] flex-col gap-0 overflow-hidden rounded-t-xl p-0 sm:mx-auto sm:max-w-lg"
        >
          <SheetHeader className="border-b px-4 py-4 text-left">
            <SheetTitle data-testid="payroll-day-edit-title">
              {editDate ? formatClassDay(editDate) : "Edit day"}
            </SheetTitle>
            <p className="text-sm text-muted-foreground">
              Change only what was different. Save when it looks right.
            </p>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto px-4 py-4">
            {dayLoading && !view ? (
              <p>Loading…</p>
            ) : !view ? (
              <p className="text-destructive">Could not open this day.</p>
            ) : (
              <>
                <label className="mb-6 block text-sm font-medium">
                  Anything unusual today?
                  <Textarea
                    className="mt-2"
                    value={view.note}
                    data-testid="payroll-day-note"
                    onChange={(event) => setDraft({ ...view, note: event.target.value })}
                  />
                </label>
                {groups.map((group) => (
                  <section key={group.personName} className="mb-6 border-b pb-4 last:border-0">
                    <h2 className="mb-3 text-base font-medium">{group.personName}</h2>
                    {group.jobs.map((job) => (
                      <div key={job.jobId} className="mb-4" data-testid={`payroll-job-${job.jobId}`}>
                        <p className="mb-2 text-sm text-muted-foreground">{job.jobLabel}</p>
                        <div className="grid grid-cols-2 gap-2">
                          <Button
                            type="button"
                            className="h-11"
                            variant={job.present === "here" ? "default" : "outline"}
                            data-testid={`here-${job.jobId}`}
                            onClick={() => update(job.jobId, { present: "here" })}
                          >
                            Here
                          </Button>
                          <Button
                            type="button"
                            className="h-11"
                            variant={job.present === "away" ? "default" : "outline"}
                            data-testid={`away-${job.jobId}`}
                            onClick={() => update(job.jobId, { present: "away" })}
                          >
                            Not here
                          </Button>
                        </div>
                        <button
                          type="button"
                          className="mt-2 text-sm underline"
                          onClick={() => setOpenHours(openHours === job.jobId ? null : job.jobId)}
                        >
                          Different hours
                        </button>
                        {openHours === job.jobId && (
                          <Input
                            className="mt-2 h-11"
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
                        <button
                          type="button"
                          className="mt-1 block text-sm underline"
                          onClick={() => setOpenNote(openNote === job.jobId ? null : job.jobId)}
                        >
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
              </>
            )}
          </div>

          <div className="border-t bg-background p-4">
            <Button
              type="button"
              className="h-12 w-full text-base"
              disabled={!view || save.isPending}
              data-testid="payroll-day-save"
              onClick={() => view && save.mutate(view)}
            >
              {save.isPending ? "Saving…" : "Save changes"}
            </Button>
            {save.isError && (
              <p className="mt-2 text-center text-sm text-destructive">Could not save. Try again.</p>
            )}
            {editDate && (
              <p className="mt-2 text-center text-xs text-muted-foreground">
                {formatClassDayShort(editDate)}
              </p>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
