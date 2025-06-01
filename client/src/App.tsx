import React from "react";
import { Switch, Route, useLocation } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SupabaseProvider, useAuth } from "@/components/SupabaseProvider";


import Home from "@/pages/Home";
import Login from "@/pages/Login";
import { SupabaseLogin } from "@/components/auth/SupabaseLogin";
import EmbeddedLogin from "@/components/auth/EmbeddedLogin";
import DirectAuth0Login from "@/components/auth/DirectAuth0Login";
import Register from "@/pages/Register";
import RoleSelection from "@/pages/RoleSelection";
import SchoolAdminLogin from "@/pages/SchoolAdminLogin";
import Dashboard from "@/pages/Dashboard";
import PaymentsPage from "@/pages/PaymentsPage";
import SchedulePage from "@/pages/SchedulePage";
import Curriculum from "@/pages/Curriculum";
import CurriculumDetail from "@/pages/CurriculumDetail";
import Lessons from "@/pages/Lessons";
import AILessonGenerator from "@/pages/AILessonGenerator";
import AIWorksheetGenerator from "@/pages/AIWorksheetGenerator";
import OCRWorksheetGenerator from "@/pages/OCRWorksheetGenerator";
import KnowledgeBase from "@/pages/KnowledgeBase";
import KnowledgeBaseDetail from "@/pages/KnowledgeBaseDetail";
import KnowledgeBaseEdit from "@/pages/KnowledgeBaseEdit";
import Checkout from "@/pages/Checkout";
import CheckoutSuccess from "@/pages/CheckoutSuccess";
import { RegistrationPage } from "@/pages/RegistrationPage";
import { ProgramsPage } from "@/pages/ProgramsPage";
import ProgramsParentPage from "@/pages/ProgramsParentPage";
import { SimpleClassesPage } from "./pages/SimpleClassesPage";
import StaffInvitePage from "./pages/schools/StaffInvitePage";
import StaffPositionsPage from "./pages/schools/StaffPositionsPage";
import KnowledgeBaseCreationPage from "./pages/schools/KnowledgeBaseCreationPage";
import RolesAndPermissionsPage from "./pages/admin/RolesAndPermissionsPage";
import FeaturesOverviewPage from "./pages/admin/FeaturesOverviewPage";
import ChildRegistrationPage from "@/pages/ChildRegistrationPage";
import ChildRegistrationConfirmation from "@/pages/ChildRegistrationConfirmation";
import ChildRegistrationSuccess from "@/pages/ChildRegistrationSuccess";
import ChildrenPage from "@/pages/ChildrenPage";
import ChildrenViewPage from "@/pages/children/ChildrenViewPage";
import ChildProfilePage from "@/pages/children/ChildProfilePage";
import ChildProfileEditPage from "@/pages/ChildProfileEditPage";
import ClassesUploadPage from "./pages/admin/ClassesUploadPage";
import ClassCreationPage from "./pages/admin/ClassCreationPage";
import ClassesPage from "./pages/ClassesPage";
import CalendarPage from "./pages/CalendarPage";
import ProgramsBrowseRedirect from "./pages/ProgramsBrowseRedirect";
import EnrollmentAssistantPage from "@/pages/EnrollmentAssistantPage";
import SchoolRegistrationPage from "@/pages/SchoolRegistrationPage";
import SchoolRegistrationConfirmationPage from "@/pages/SchoolRegistrationConfirmationPage";
import SettingsPage from "@/pages/SettingsPage";
import LogoutPage from "@/pages/LogoutPage";

const CallbackPage = () => {
  const { isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();

  React.useEffect(() => {
    if (isAuthenticated) {
      setLocation('/');
    }
  }, [isAuthenticated, setLocation]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
        <p className="mt-4 text-gray-600">Processing login...</p>
      </div>
    </div>
  );
};
import NotFound from "@/pages/not-found";

// School Admin pages
import MySchoolPage from "./pages/schools/MySchoolPage";
import SchoolEditPage from "./pages/schools/SchoolEditPage";
import SchoolClassesPage from "./pages/schools/ClassesPage";
import SchoolClassCreationPage from "./pages/schools/SchoolClassCreationPage";
import ClassRosterPage from "./pages/schools/ClassRosterPage";
import StaffPage from "./pages/schools/StaffPage";
import StaffEditPage from "./pages/schools/StaffEditPage";
import StudentsPage from "./pages/schools/StudentsPage";
import StudentDetailPage from "./pages/schools/StudentDetailPage";
import StudentRegistrationPage from "./pages/schools/StudentRegistrationPage";
import KnowledgeBasePage from "./pages/schools/KnowledgeBasePage";
import KnowledgeBaseDetailsPage from "./pages/schools/KnowledgeBaseDetailsPage";
import AIStatusProvider from "@/contexts/AIStatusContext";

function Router() {
  const { isAuthenticated, isLoading, user, error } = useAuth();

  // Handle OAuth callbacks (Auth0 and Supabase)
  React.useEffect(() => {
    // Handle Auth0 callback
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const state = urlParams.get('state');
    const error = urlParams.get('error');
    const errorDescription = urlParams.get('error_description');

    if (error) {
      console.error('🚨 Auth0 Callback Error:', error, errorDescription);
      // Clear error from URL but don't redirect
      window.history.replaceState({}, document.title, window.location.pathname);
      return;
    }

    if (code && state) {
      console.log('🔄 Auth0 callback detected, processing...');
      // Auth0 will handle the callback automatically
      return;
    }

    // Handle Supabase OAuth callback (access_token in URL hash)
    const hash = window.location.hash;
    if (hash && hash.includes('access_token=')) {
      console.log('🔄 Supabase OAuth callback detected');
      // Supabase client will automatically handle the session from URL hash
      // Clear the hash from URL after a short delay to allow processing
      setTimeout(() => {
        if (window.location.hash.includes('access_token=')) {
          window.history.replaceState({}, document.title, window.location.pathname);
        }
      }, 2000);
    }
  }, []);

  // Handle Auth0 errors
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full mx-4">
          <div className="text-center">
            <div className="text-red-500 mb-4">
              <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.084 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              Authentication Error
            </h2>
            <p className="text-gray-600 text-sm mb-4">
              {error.message || 'An error occurred during authentication'}
            </p>
            <button 
              onClick={() => window.location.reload()}
              className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
            >
              Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  // Role-based dashboard routing
  const getRoleDashboard = (userRole: string) => {
    switch (userRole) {
      case 'school_admin':
        return MySchoolPage;
      case 'educator':
        return Dashboard; // Could be a specific educator dashboard
      case 'parent':
      default:
        return Dashboard; // Parent dashboard
    }
  };

  return (
    <Switch>
      <Route path="/logout" component={LogoutPage} />
      {isAuthenticated ? (
        <Route path="/" component={getRoleDashboard(user?.role || 'parent')} />
      ) : (
        <Route path="/" component={SupabaseLogin} />
      )}
      <Route path="/login" component={SupabaseLogin} />
      <Route path="/auth0-login" component={DirectAuth0Login} />
      <Route path="/embedded-login" component={EmbeddedLogin} />
      <Route path="/old-login" component={Login} />
      <Route path="/school-admin-login" component={SchoolAdminLogin} />
      <Route path="/register" component={Register} />
      <Route path="/role-selection" component={RoleSelection} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/curriculum" component={Curriculum} />
      <Route path="/curriculum/:id" component={CurriculumDetail} />
      <Route path="/lessons" component={Lessons} />
      <Route path="/lessons/ai-generator" component={AILessonGenerator} />
      <Route path="/ai-generator/lesson" component={AILessonGenerator} />
      <Route path="/ai-generator/worksheet" component={AIWorksheetGenerator} />
      <Route path="/ai-generator/ocr" component={OCRWorksheetGenerator} />
      <Route path="/ai-generator/activity" component={AIWorksheetGenerator} />
      <Route path="/ai-generator/curriculum" component={Curriculum} />
      <Route path="/knowledge-base" component={KnowledgeBase} />
      <Route path="/knowledge-base/:id/edit" component={KnowledgeBaseEdit} />
      <Route path="/knowledge-base/:id" component={KnowledgeBaseDetail} />
      <Route path="/checkout" component={Checkout} />
      <Route path="/checkout-success" component={CheckoutSuccess} />

      {/* Registration system routes */}
      <Route path="/registration" component={RegistrationPage} />
      <Route path="/programs" component={ProgramsParentPage} />
      <Route path="/programs/browse" component={ProgramsBrowseRedirect} />
      <Route path="/classes" component={ClassesPage} />
      <Route path="/children" component={ChildrenPage} />
      <Route path="/children/view" component={ChildrenViewPage} />
      <Route path="/children/:id" component={ChildProfilePage} />
      <Route path="/children/register" component={ChildRegistrationPage} />
      <Route path="/children/register/confirm" component={ChildRegistrationConfirmation} />
      <Route path="/children/register/success" component={ChildRegistrationSuccess} />
      <Route path="/children/:id/edit" component={ChildProfileEditPage} />
      <Route path="/calendar" component={CalendarPage} />
      <Route path="/schedule" component={SchedulePage} />
      <Route path="/payments" component={PaymentsPage} />
      <Route path="/settings" component={SettingsPage} />
      <Route path="/enrollment-assistant" component={EnrollmentAssistantPage} />

      {/* School/Co-op registration routes */}
      <Route path="/schools/register" component={SchoolRegistrationPage} />
      <Route path="/schools/register/confirm" component={SchoolRegistrationConfirmationPage} />

      {/* School Admin routes */}
      <Route path="/schools" component={MySchoolPage} />
      <Route path="/schools/dashboard" component={MySchoolPage} />
      <Route path="/schools/my-school" component={MySchoolPage} />
      <Route path="/schools/my-school/edit" component={SchoolEditPage} />
      <Route path="/schools/classes" component={SchoolClassesPage} />
      <Route path="/schools/classes/new" component={SchoolClassCreationPage} />
      <Route path="/schools/classes/:id/edit" component={SchoolClassCreationPage} />
      <Route path="/schools/classes/:id/roster" component={ClassRosterPage} />
      <Route path="/schools/staff" component={StaffPage} />
      <Route path="/schools/staff/invite" component={StaffInvitePage} />
      <Route path="/schools/staff/positions" component={StaffPositionsPage} />
      <Route path="/school-admin/staff-positions" component={StaffPositionsPage} />
      <Route path="/schools/staff/:id/edit" component={StaffEditPage} />
      <Route path="/schools/students" component={StudentsPage} />
      <Route path="/schools/students/:id" component={StudentDetailPage} />
      <Route path="/schools/students/:id/edit" component={StudentRegistrationPage} />
      <Route path="/schools/students/register" component={StudentRegistrationPage} />
      <Route path="/schools/knowledge-base" component={KnowledgeBasePage} />
      <Route path="/schools/knowledge-base/new" component={KnowledgeBaseCreationPage} />
      <Route path="/schools/knowledge-base/:id" component={KnowledgeBaseDetailsPage} />

      {/* Admin routes */}
      <Route path="/admin/classes" component={SimpleClassesPage} />
      <Route path="/admin/classes/new" component={ClassCreationPage} />
      <Route path="/admin/classes/upload" component={ClassesUploadPage} />
      <Route path="/admin/roles" component={RolesAndPermissionsPage} />
      <Route path="/admin/features" component={FeaturesOverviewPage} />
      <Route path="/admin/classes/edit/:id" component={ClassCreationPage} />
      <Route path="/admin/programs" component={Dashboard} />
      <Route path="/admin/programs/:rest*" component={Dashboard} />
      <Route path="/admin/users" component={Dashboard} />
      <Route path="/admin/users/:rest*" component={Dashboard} />
      <Route path="/admin/reports" component={Dashboard} />
      <Route path="/admin/reports/:rest*" component={Dashboard} />
      <Route path="/admin" component={Dashboard} />

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <SupabaseProvider>
        <AIStatusProvider>
          <TooltipProvider>
            <Toaster />
            <Router />
          </TooltipProvider>
        </AIStatusProvider>
      </SupabaseProvider>
    </QueryClientProvider>
  );
}

export default App;