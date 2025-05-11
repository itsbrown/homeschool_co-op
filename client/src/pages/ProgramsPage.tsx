import { useState } from "react";
import { DashboardShell } from "../components/ui/dashboard-shell";
import { useAuth } from "../hooks/use-auth";
import { ProgramList } from "../components/registration/ProgramList";
import { ProgramEnrollmentForm } from "../components/registration/ProgramEnrollmentForm";
import { EnrollmentList } from "../components/registration/EnrollmentList";
import { Route, Switch, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";

export function ProgramsPage() {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();
  const { data: userRole } = useQuery({ queryKey: ["/api/auth/role"] });
  
  // If not authenticated, redirect to login
  if (!isLoading && !user) {
    window.location.href = "/login";
    return null;
  }

  const isAdmin = userRole === "admin";

  return (
    <DashboardShell>
      <div className="flex flex-col space-y-8 p-1">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Programs</h2>
            <p className="text-muted-foreground">
              Browse and register for available programs
            </p>
          </div>
        </div>

        <Switch>
          <Route path="/programs">
            {({ matches }) => {
              if (matches) return <ProgramList isAdmin={isAdmin} />;
              return null;
            }}
          </Route>
          <Route path="/programs/enroll">
            <ProgramEnrollmentForm />
          </Route>
          <Route path="/programs/enrollments">
            <EnrollmentList />
          </Route>
          <Route path="/programs/enrollments/:childId">
            {(params) => (
              <EnrollmentList childId={parseInt(params.childId)} />
            )}
          </Route>
        </Switch>
      </div>
    </DashboardShell>
  );
}