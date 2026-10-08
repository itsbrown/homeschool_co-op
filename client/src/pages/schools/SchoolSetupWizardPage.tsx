import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import AppShell from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

type Status = {
  plan: string;
  planName: string;
  setupCompletedAt: string | null;
};

const STEPS = ["School", "Campus", "Session", "Class", "Staff", "Done"] as const;

export default function SchoolSetupWizardPage() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [step, setStep] = useState(0);
  const [schoolId, setSchoolId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [brandColor, setBrandColor] = useState("#1d4ed8");
  const [logo, setLogo] = useState("");
  const [campus, setCampus] = useState("Main campus");
  const [sessionName, setSessionName] = useState("First term");
  const [classTitle, setClassTitle] = useState("Morning class");
  const [staffEmail, setStaffEmail] = useState("");
  const [staffFirst, setStaffFirst] = useState("");
  const [staffLast, setStaffLast] = useState("");

  const statusQuery = useQuery({
    queryKey: ["/api/platform-subscriptions/status"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/platform-subscriptions/status");
      if (!response.ok) throw new Error("Could not load school setup");
      return response.json() as Promise<Status>;
    },
  });

  const schoolQuery = useQuery({
    queryKey: ["/api/school-admin/my-school"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/school-admin/my-school");
      if (!response.ok) throw new Error("Could not load school");
      const school = await response.json();
      if (school?.id) setSchoolId(Number(school.id));
      if (school?.name && !name) setName(school.name);
      return school;
    },
  });

  const saveSchool = useMutation({
    mutationFn: async () => {
      if (!schoolId) throw new Error("School is not loaded yet");
      const response = await apiRequest("PATCH", `/api/school-admin/schools/${schoolId}`, {
        name,
        brandColor,
      });
      if (!response.ok) throw new Error("Could not save the school");
      if (logo.trim()) {
        const logoResponse = await apiRequest("POST", "/api/schools/upload-logo", { logoUrl: logo, schoolId });
        if (!logoResponse.ok) throw new Error("Logo must be a path under /public/logos/");
      }
    },
    onSuccess: () => setStep(1),
    onError: (error: Error) => toast({ title: "Could not save", description: error.message, variant: "destructive" }),
  });

  const saveCampus = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/locations", {
        name: campus,
        address: "TBD",
        city: schoolQuery.data?.city || "TBD",
        state: schoolQuery.data?.state || "NA",
        zipCode: schoolQuery.data?.zipCode || "00000",
      });
      if (response.status === 403) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.message || "Campus limit reached. Upgrade the platform plan.");
      }
      if (!response.ok) throw new Error("Could not add the campus");
    },
    onSuccess: () => setStep(2),
    onError: (error: Error) => toast({ title: "Campus", description: error.message, variant: "destructive" }),
  });

  const saveSession = useMutation({
    mutationFn: async () => {
      const year = new Date().getFullYear();
      const response = await apiRequest("POST", "/api/admin/sessions", {
        name: sessionName,
        startDate: `${year}-09-01`,
        endDate: `${year}-12-15`,
      });
      if (!response.ok) throw new Error("Could not create the session");
    },
    onSuccess: () => setStep(3),
    onError: (error: Error) => toast({ title: "Session", description: error.message, variant: "destructive" }),
  });

  const saveClass = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/admin-classes/classes", {
        title: classTitle,
        description: "First class",
        category: "General",
        price: 0,
        gradeLevels: "K-12",
      });
      if (!response.ok) throw new Error("Could not create the class");
    },
    onSuccess: () => setStep(4),
    onError: (error: Error) => toast({ title: "Class", description: error.message, variant: "destructive" }),
  });

  const saveStaff = useMutation({
    mutationFn: async () => {
      if (!staffEmail.trim()) return;
      const response = await apiRequest("POST", "/api/school-admin/staff/invite", {
        email: staffEmail,
        firstName: staffFirst || "Staff",
        lastName: staffLast || "Member",
        role: "educator",
      });
      if (!response.ok) throw new Error("Could not invite staff");
    },
    onSuccess: () => setStep(5),
    onError: (error: Error) => toast({ title: "Staff invite", description: error.message, variant: "destructive" }),
  });

  const finish = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/platform-subscriptions/setup-complete", {});
      if (!response.ok) throw new Error("Could not finish setup");
    },
    onSuccess: () => setLocation("/schools/my-school"),
    onError: (error: Error) => toast({ title: "Setup", description: error.message, variant: "destructive" }),
  });

  return (
    <AppShell>
      <div className="max-w-xl mx-auto p-4 space-y-4">
        <h1 className="text-2xl font-semibold">Set up your school</h1>
        <p className="text-sm text-muted-foreground">
          Step {step + 1} of {STEPS.length}: {STEPS[step]}
          {statusQuery.data?.planName ? ` · ${statusQuery.data.planName}` : ""}
        </p>
        <Card>
          <CardHeader>
            <CardTitle>{STEPS[step]}</CardTitle>
            <CardDescription>These use the same school records as the rest of the app.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {step === 0 && (
              <>
                <Label htmlFor="school-name">School name</Label>
                <Input id="school-name" value={name} onChange={(e) => setName(e.target.value)} />
                <Label htmlFor="brand-color">Brand color</Label>
                <Input id="brand-color" value={brandColor} onChange={(e) => setBrandColor(e.target.value)} />
                <Label htmlFor="logo">Logo path</Label>
                <Input id="logo" value={logo} placeholder="/public/logos/your-logo.png" onChange={(e) => setLogo(e.target.value)} />
                <Button onClick={() => saveSchool.mutate()} disabled={saveSchool.isPending || !name.trim()}>Save and continue</Button>
              </>
            )}
            {step === 1 && (
              <>
                <Label htmlFor="campus">Campus name</Label>
                <Input id="campus" value={campus} onChange={(e) => setCampus(e.target.value)} />
                <Button onClick={() => saveCampus.mutate()} disabled={saveCampus.isPending}>Add campus</Button>
              </>
            )}
            {step === 2 && (
              <>
                <Label htmlFor="session">Session name</Label>
                <Input id="session" value={sessionName} onChange={(e) => setSessionName(e.target.value)} />
                <Button onClick={() => saveSession.mutate()} disabled={saveSession.isPending}>Add session</Button>
              </>
            )}
            {step === 3 && (
              <>
                <Label htmlFor="class-title">Class title</Label>
                <Input id="class-title" value={classTitle} onChange={(e) => setClassTitle(e.target.value)} />
                <Button onClick={() => saveClass.mutate()} disabled={saveClass.isPending}>Add class</Button>
              </>
            )}
            {step === 4 && (
              <>
                <Label htmlFor="staff-email">Staff email</Label>
                <Input id="staff-email" value={staffEmail} onChange={(e) => setStaffEmail(e.target.value)} />
                <div className="grid grid-cols-2 gap-2">
                  <Input value={staffFirst} placeholder="First name" onChange={(e) => setStaffFirst(e.target.value)} />
                  <Input value={staffLast} placeholder="Last name" onChange={(e) => setStaffLast(e.target.value)} />
                </div>
                <Button onClick={() => saveStaff.mutate()} disabled={saveStaff.isPending}>
                  {staffEmail.trim() ? "Send invite" : "Skip staff"}
                </Button>
              </>
            )}
            {step === 5 && (
              <Button onClick={() => finish.mutate()} disabled={finish.isPending}>Finish setup</Button>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
