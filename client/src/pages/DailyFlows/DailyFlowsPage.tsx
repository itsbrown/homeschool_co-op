import { useAuth } from "@/components/SupabaseProvider";
import { useRole } from "@/contexts/RoleContext";
import { Route, Switch } from "wouter";

// School Admin pages
import DailyFlowTemplatesPage from "./school-admin/DailyFlowTemplatesPage";
import DailyFlowEntriesPage from "./school-admin/DailyFlowEntriesPage";  
import DailyFlowReportsPage from "./school-admin/DailyFlowReportsPage";

// Educator pages
import EducatorDailyFlowsPage from "./educator/EducatorDailyFlowsPage";

export default function DailyFlowsPage() {
  const { activeRole } = useRole();
  
  if (activeRole === 'schoolAdmin' || activeRole === 'superAdmin') {
    return (
      <Switch>
        <Route path="/schools/daily-flows/templates" component={DailyFlowTemplatesPage} />
        <Route path="/schools/daily-flows/entries" component={DailyFlowEntriesPage} />
        <Route path="/schools/daily-flows/reports" component={DailyFlowReportsPage} />
        <Route path="/schools/daily-flows">
          <DailyFlowTemplatesPage />
        </Route>
      </Switch>
    );
  }
  
  if (activeRole === 'educator') {
    return (
      <Switch>
        <Route path="/educator/daily-flows" component={EducatorDailyFlowsPage} />
      </Switch>
    );
  }
  
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-gray-900">Daily Flows</h1>
      <p className="text-gray-600 mt-2">Access restricted to school administrators and educators.</p>
    </div>
  );
}