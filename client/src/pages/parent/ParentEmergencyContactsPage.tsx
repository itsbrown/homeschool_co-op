import { Redirect } from "wouter";
import { useAuth } from "@/components/SupabaseProvider";
import ParentAppShell from "@/components/layout/ParentAppShell";
import { EmergencyContactsManagement } from "@/components/registration/EmergencyContactsManagement";

export default function ParentEmergencyContactsPage() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <ParentAppShell>
        <div className="flex justify-center items-center min-h-96">
          <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      </ParentAppShell>
    );
  }

  if (!isAuthenticated) {
    return <Redirect to="/login" />;
  }

  return (
    <ParentAppShell>
      <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Emergency Contacts</h2>
          <p className="text-muted-foreground">
            Add people we can reach in an emergency or authorize for pickup.
          </p>
        </div>
        <EmergencyContactsManagement />
      </div>
    </ParentAppShell>
  );
}
