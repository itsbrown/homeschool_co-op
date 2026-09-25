import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { groupByPerson } from "@shared/payroll-day";

type Person = {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
};

type Job = {
  id: number;
  personName: string;
  jobLabel: string;
  hourlyRate: number;
  usualHours: number;
};

export default function PayrollRatesPage() {
  const [adding, setAdding] = useState(false);
  const [personName, setPersonName] = useState("");
  const [jobLabel, setJobLabel] = useState("");
  const [hourlyRate, setHourlyRate] = useState("");
  const [usualHours, setUsualHours] = useState("");
  const [personQuery, setPersonQuery] = useState("");
  const { data, isLoading, error } = useQuery<{ jobs: Job[] }>({
    queryKey: ["/api/payroll-day/rates"],
  });
  const { data: summary } = useQuery<{ pay: number; saved: boolean }>({
    queryKey: ["/api/payroll-day/summary"],
  });
  const { data: fillers } = useQuery<{ people: Person[] }>({
    queryKey: ["/api/payroll-day/fillers"],
  });
  const { data: matches } = useQuery<{ people: Person[] }>({
    queryKey: [`/api/payroll-day/people?q=${encodeURIComponent(personQuery)}`],
    enabled: personQuery.trim().length >= 2,
  });

  const saveRate = useMutation({
    mutationFn: async (job: Job) => {
      const response = await apiRequest("PATCH", `/api/payroll-day/jobs/${job.id}`, {
        hourlyRate: job.hourlyRate,
        usualHours: job.usualHours,
      });
      if (!response.ok) throw new Error("save failed");
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/payroll-day/rates"] }),
  });

  const addJob = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/payroll-day/jobs", {
        personName,
        jobLabel,
        hourlyRate: Number(hourlyRate),
        usualHours: Number(usualHours),
      });
      if (!response.ok) throw new Error("add failed");
    },
    onSuccess: () => {
      setAdding(false);
      setPersonName("");
      setJobLabel("");
      setHourlyRate("");
      setUsualHours("");
      queryClient.invalidateQueries({ queryKey: ["/api/payroll-day/rates"] });
    },
  });

  const grantFiller = useMutation({
    mutationFn: async (userId: number) => {
      const response = await apiRequest("POST", "/api/payroll-day/fillers", { userId });
      if (!response.ok) throw new Error("grant failed");
    },
    onSuccess: () => {
      setPersonQuery("");
      queryClient.invalidateQueries({ queryKey: ["/api/payroll-day/fillers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/payroll-day/access"] });
    },
  });

  const revokeFiller = useMutation({
    mutationFn: async (userId: number) => {
      const response = await apiRequest("DELETE", `/api/payroll-day/fillers/${userId}`);
      if (!response.ok) throw new Error("revoke failed");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payroll-day/fillers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/payroll-day/access"] });
    },
  });

  if (isLoading) return <p className="p-6">Loading hourly rates…</p>;
  if (error || !data) return <p className="p-6" data-testid="payroll-rates-denied">You do not have access to hourly rates.</p>;

  const groups = groupByPerson(data.jobs.map((job) => ({ ...job, personName: job.personName })));

  return (
    <div className="mx-auto max-w-xl p-6">
      <h1 className="mb-2 text-2xl font-medium">Hourly rates</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        A change shows up the next class day. A day already saved keeps the old rate.
      </p>
      {summary?.saved && (
        <p className="mb-4" data-testid="payroll-day-pay">Today’s pay ${summary.pay.toFixed(2)}</p>
      )}
      {groups.map((group) => (
        <section key={group.personName} className="mb-6 border-b pb-4">
          <h2 className="mb-3 text-lg">{group.personName}</h2>
          {group.jobs.map((job) => (
            <RateRow key={job.id} job={job} onSave={(next) => saveRate.mutate(next)} />
          ))}
        </section>
      ))}
      {adding ? (
        <div className="space-y-3">
          <Input placeholder="Person" value={personName} onChange={(event) => setPersonName(event.target.value)} data-testid="add-job-person" />
          <Input placeholder="What they do" value={jobLabel} onChange={(event) => setJobLabel(event.target.value)} data-testid="add-job-label" />
          <Input placeholder="Hourly rate" type="number" value={hourlyRate} onChange={(event) => setHourlyRate(event.target.value)} data-testid="add-job-rate" />
          <Input placeholder="Usual hours" type="number" value={usualHours} onChange={(event) => setUsualHours(event.target.value)} data-testid="add-job-hours" />
          <Button type="button" onClick={() => addJob.mutate()} disabled={addJob.isPending}>Save job</Button>
        </div>
      ) : (
        <Button type="button" variant="outline" data-testid="add-job" onClick={() => setAdding(true)}>
          Add a job
        </Button>
      )}
      <section className="mt-8 border-t pt-6">
        <h2 className="mb-2 text-lg">Who can fill hours</h2>
        <p className="mb-3 text-sm text-muted-foreground">
          These people see Today&apos;s hours. They cannot change rates.
        </p>
        <ul className="mb-4 space-y-2">
          {(fillers?.people ?? []).map((person) => (
            <li key={person.id} className="flex items-center justify-between gap-3" data-testid={`filler-${person.id}`}>
              <span>{personLabel(person)}</span>
              <Button type="button" variant="outline" onClick={() => revokeFiller.mutate(person.id)}>
                Remove
              </Button>
            </li>
          ))}
        </ul>
        <Input
          placeholder="Search by name or email"
          value={personQuery}
          onChange={(event) => setPersonQuery(event.target.value)}
          data-testid="filler-search"
        />
        <ul className="mt-2 space-y-2">
          {(matches?.people ?? []).map((person) => (
            <li key={person.id}>
              <Button
                type="button"
                variant="outline"
                data-testid={`filler-result-${person.id}`}
                onClick={() => grantFiller.mutate(person.id)}
              >
                Add {personLabel(person)}
              </Button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function personLabel(person: Person): string {
  const name = `${person.firstName} ${person.lastName}`.trim();
  return name ? `${name} (${person.email})` : person.email;
}

function RateRow({ job, onSave }: { job: Job; onSave: (job: Job) => void }) {
  const [rate, setRate] = useState(String(job.hourlyRate));
  const [hours, setHours] = useState(String(job.usualHours));
  return (
    <div className="mb-3 grid grid-cols-[1fr_120px] items-end gap-3" data-testid={`rate-job-${job.id}`}>
      <div>
        <p>{job.jobLabel}</p>
        <label className="mt-2 block text-sm text-muted-foreground">
          Usual hours
          <Input className="mt-1" type="number" value={hours} onChange={(event) => setHours(event.target.value)} />
        </label>
      </div>
      <label className="block text-sm text-muted-foreground">
        Hourly rate
        <Input
          className="mt-1"
          type="number"
          data-testid={`rate-input-${job.id}`}
          value={rate}
          onChange={(event) => setRate(event.target.value)}
          onBlur={() => onSave({ ...job, hourlyRate: Number(rate), usualHours: Number(hours) })}
        />
      </label>
    </div>
  );
}
