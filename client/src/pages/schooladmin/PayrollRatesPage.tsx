import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import SchoolAdminLayout from "@/components/layout/SchoolAdminLayout";
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

  const saveJob = useMutation({
    mutationFn: async (job: Job) => {
      const response = await apiRequest("PATCH", `/api/payroll-day/jobs/${job.id}`, {
        personName: job.personName,
        jobLabel: job.jobLabel,
        hourlyRate: job.hourlyRate,
        usualHours: job.usualHours,
      });
      if (!response.ok) throw new Error("save failed");
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/payroll-day/rates"] }),
  });

  const removeJob = useMutation({
    mutationFn: async (jobId: number) => {
      const response = await apiRequest("DELETE", `/api/payroll-day/jobs/${jobId}`);
      if (!response.ok) throw new Error("remove failed");
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

  if (isLoading) {
    return (
      <SchoolAdminLayout pageTitle="Hourly rates">
        <p className="p-6">Loading hourly rates…</p>
      </SchoolAdminLayout>
    );
  }
  if (error || !data) {
    return (
      <SchoolAdminLayout pageTitle="Hourly rates">
        <p className="p-6" data-testid="payroll-rates-denied">You do not have access to hourly rates.</p>
      </SchoolAdminLayout>
    );
  }

  const groups = groupByPerson(data.jobs.map((job) => ({ ...job, personName: job.personName })));

  return (
    <SchoolAdminLayout pageTitle="Hourly rates">
      <div className="mx-auto max-w-xl">
        <p className="mb-6 text-sm text-muted-foreground">
          Change a row and press Save. A change shows up the next class day. A day already saved keeps the old rate.
        </p>
        {summary?.saved && (
          <p className="mb-4" data-testid="payroll-day-pay">Today’s pay ${summary.pay.toFixed(2)}</p>
        )}
        {groups.map((group) => (
          <section key={group.personName} className="mb-6 border-b pb-4">
            <h2 className="mb-3 text-lg">{group.personName}</h2>
            {group.jobs.map((job) => (
              <RateRow
                key={job.id}
                job={job}
                onSave={(next) => saveJob.mutate(next)}
                onRemove={() => removeJob.mutate(job.id)}
                saving={saveJob.isPending}
                removing={removeJob.isPending}
              />
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
    </SchoolAdminLayout>
  );
}

function personLabel(person: Person): string {
  const name = `${person.firstName} ${person.lastName}`.trim();
  return name ? `${name} (${person.email})` : person.email;
}

function RateRow({
  job,
  onSave,
  onRemove,
  saving,
  removing,
}: {
  job: Job;
  onSave: (job: Job) => void;
  onRemove: () => void;
  saving: boolean;
  removing: boolean;
}) {
  const [person, setPerson] = useState(job.personName);
  const [label, setLabel] = useState(job.jobLabel);
  const [rate, setRate] = useState(String(job.hourlyRate));
  const [hours, setHours] = useState(String(job.usualHours));
  const [savedFlash, setSavedFlash] = useState(false);
  const dirty =
    person.trim() !== job.personName ||
    label.trim() !== job.jobLabel ||
    Number(rate) !== job.hourlyRate ||
    Number(hours) !== job.usualHours;

  return (
    <div className="mb-4 space-y-2 rounded-md border p-3" data-testid={`rate-job-${job.id}`}>
      <label className="block text-sm text-muted-foreground">
        Person
        <Input
          className="mt-1"
          value={person}
          onChange={(event) => setPerson(event.target.value)}
          data-testid={`rate-person-${job.id}`}
        />
      </label>
      <label className="block text-sm text-muted-foreground">
        What they do
        <Input
          className="mt-1"
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          data-testid={`rate-label-${job.id}`}
        />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm text-muted-foreground">
          Usual hours
          <Input
            className="mt-1"
            type="number"
            value={hours}
            onChange={(event) => setHours(event.target.value)}
            data-testid={`rate-hours-${job.id}`}
          />
        </label>
        <label className="block text-sm text-muted-foreground">
          Hourly rate
          <Input
            className="mt-1"
            type="number"
            data-testid={`rate-input-${job.id}`}
            value={rate}
            onChange={(event) => setRate(event.target.value)}
          />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          data-testid={`rate-save-${job.id}`}
          disabled={!dirty || saving}
          onClick={() => {
            onSave({
              ...job,
              personName: person.trim(),
              jobLabel: label.trim(),
              hourlyRate: Number(rate),
              usualHours: Number(hours),
            });
            setSavedFlash(true);
            window.setTimeout(() => setSavedFlash(false), 2000);
          }}
        >
          Save
        </Button>
        <Button type="button" variant="outline" onClick={onRemove} disabled={removing}>
          Remove
        </Button>
        {savedFlash && <span className="text-sm text-muted-foreground">Saved</span>}
      </div>
    </div>
  );
}
