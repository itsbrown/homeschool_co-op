import { useState } from "react";
import { DashboardShell } from "../components/ui/dashboard-shell";
import { Route, Switch, useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth0";
import { RegistrationDashboard } from "../components/registration/RegistrationDashboard";
import { ChildrenManagement } from "../components/registration/ChildrenManagement";
import { EmergencyContactsManagement } from "../components/registration/EmergencyContactsManagement";

// Registration Page with sub-routes
export function RegistrationPage() {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  // If not authenticated, redirect to login
  if (!isLoading && !user) {
    window.location.href = "/login";
    return null;
  }

  return (
    <DashboardShell>
      <div className="flex flex-col space-y-8 p-1">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Registration Management</h2>
            <p className="text-muted-foreground">
              Manage your family profile and program registrations
            </p>
          </div>
        </div>

        <Switch>
          <Route path="/registration" component={RegistrationDashboard} />
          <Route path="/registration/children" component={ChildrenManagement} />
          <Route path="/registration/contacts" component={EmergencyContactsManagement} />
        </Switch>
      </div>
    </DashboardShell>
  );
}