import { DashboardShell } from "../components/ui/dashboard-shell";
import { Redirect, Route, Switch } from "wouter";
import { useAuth } from "@/components/SupabaseProvider";
import { RegistrationDashboard } from "../components/registration/RegistrationDashboard";
import { ChildrenManagement } from "../components/registration/ChildrenManagement";

// Registration Page with sub-routes
export function RegistrationPage() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return null;
  }

  if (!isAuthenticated) {
    return <Redirect to="/login" />;
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
          <Route path="/registration/contacts">
            <Redirect to="/parent/emergency-contacts" />
          </Route>
          <Route path="/registration/children" component={ChildrenManagement} />
          <Route path="/registration" component={RegistrationDashboard} />
        </Switch>
      </div>
    </DashboardShell>
  );
}