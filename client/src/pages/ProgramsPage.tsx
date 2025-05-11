import { ProgramList } from "@/components/registration/ProgramList";
import { DashboardShell } from "@/components/ui/dashboard-shell";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";

export default function ProgramsPage() {
  const { user, isLoading: isLoadingAuth } = useAuth();
  
  const { data: programs, isLoading: isLoadingPrograms } = useQuery({
    queryKey: ["/api/programs"],
    select: (data) => data.filter((program: any) => program.isPublished),
  });

  const isAdmin = user?.role === 'admin';

  return (
    <DashboardShell>
      <div className="flex flex-col space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Programs</h1>
          <p className="text-muted-foreground">
            Browse and enroll in available educational programs
          </p>
        </div>

        <ProgramList isAdmin={isAdmin} />
      </div>
    </DashboardShell>
  );
}