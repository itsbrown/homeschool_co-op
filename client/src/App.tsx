import React, { lazy, useEffect } from "react";
import { Switch, Route, useLocation } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SupabaseProvider, useAuth } from "@/components/SupabaseProvider";
import { RoleProvider, useRole } from "@/contexts/RoleContext";
import { NotificationProvider } from "@/hooks/useNotifications";
import { CartProvider } from "@/contexts/CartContext";

import Home from "@/pages/Home";
import Login from "@/pages/Login";
import { SupabaseLogin } from "@/components/auth/SupabaseLogin";
import EmbeddedLogin from "@/components/auth/EmbeddedLogin";
import DirectAuth0Login from "@/components/auth/DirectAuth0Login";
import Register from "@/pages/Register";

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
import CartCheckout from "@/pages/CartCheckout";
import CartSuccess from "@/pages/CartSuccess";
import { RegistrationPage } from "@/pages/RegistrationPage";
import { ProgramsPage } from "@/pages/ProgramsPage";
import ProgramsParentPage from "@/pages/ProgramsParentPage";
import { SimpleClassesPage } from "./pages/SimpleClassesPage";
import StaffInvitePage from "./pages/schools/StaffInvitePage";
import StaffPositionsPage from "./pages/schools/StaffPositionsPage";
import KnowledgeBaseCreationPage from "./pages/schools/KnowledgeBaseCreationPage";
import RolesAndPermissionsPage from "@/pages/admin/RolesAndPermissionsPage";
import RoleManagementPage from "@/pages/admin/RoleManagementPage";
import FeaturesOverviewPage from "@/pages/admin/FeaturesOverviewPage";
import ChildRegistrationPage from "@/pages/ChildRegistrationPage";
import ChildRegistrationConfirmation from "@/pages/ChildRegistrationConfirmation";
import ChildRegistrationSuccess from "@/pages/ChildRegistrationSuccess";
import ChildrenPage from "@/pages/ChildrenPage";
import ChildrenViewPage from "@/pages/children/ChildrenViewPage";
import ChildProfilePage from "@/pages/children/ChildProfilePage";
import ChildProfileEditPage from "@/pages/ChildProfileEditPage";
import ChildEnrollmentsPage from "@/pages/children/ChildEnrollmentsPage";
import ClassesUploadPage from "./pages/admin/ClassesUploadPage";
import ClassCreationPage from "./pages/admin/ClassCreationPage";
import ContactImportPage from "./pages/admin/ContactImportPage";
import SchoolContactImportPage from "./pages/schools/ContactImportPage";
import ClassesPage from "./pages/ClassesPage";
import CalendarPage from "./pages/CalendarPage";
import ProgramsBrowseRedirect from "@/pages/ProgramsBrowseRedirect";
import EnrollmentAssistantPage from "@/pages/EnrollmentAssistantPage";
import AIInsightsDashboard from "@/pages/AIInsightsDashboard";
import { SupportAssistantTrigger } from "@/components/AISupportAssistant";
import SchoolRegistrationPage from "@/pages/SchoolRegistrationPage";
import SchoolRegistrationConfirmationPage from "@/pages/SchoolRegistrationConfirmationPage";
import SchoolLandingPage from "@/pages/SchoolLandingPage";
import SchoolRegistrationFormPage from "@/pages/SchoolRegistrationFormPage";
import RegistrationSuccessPage from "@/pages/RegistrationSuccessPage";
import LogoutPage from "@/pages/LogoutPage";
import AuthCallback from "@/pages/AuthCallback";
import AcceptInvitationPage from "@/pages/AcceptInvitationPage";
import AcceptEducatorInvitationPage from "./pages/AcceptEducatorInvitationPage";
import BillingPage from "@/pages/BillingPage";
import PaymentHistoryPage from "@/pages/PaymentHistoryPage";
import PlatformSubscriptionPlans from "@/pages/PaymentPlans";
import ClassPaymentPlans from "@/pages/ClassPaymentPlans";
import SettingsPage from "@/pages/SettingsPage";
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import SchoolSettings from './pages/SchoolSettings';
import EducatorClassesPage from './pages/educator/EducatorClassesPage';
import EducatorClassDetailsPage from './pages/educator/EducatorClassDetailsPage';
import EducatorStudentsPage from './pages/educator/EducatorStudentsPage';
import EducatorNotificationsPage from './pages/educator/EducatorNotificationsPage';

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

const Redirect = ({ to }: { to: string }) => {
  const [, setLocation] = useLocation();

  React.useEffect(() => {
    setLocation(to);
  }, [to, setLocation]);

  return null;
};
import NotFound from "@/pages/not-found";
import AuthLogin from "@/pages/AuthLogin";
import RegistrationLandingPage from "@/pages/RegistrationLandingPage";
import RegistrationPaymentPage from "@/pages/RegistrationPaymentPage";

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
import StudentClassesPage from "./pages/schools/StudentClassesPage";
import KnowledgeBasePage from "./pages/schools/KnowledgeBasePage";
import KnowledgeBaseDetailsPage from "./pages/schools/KnowledgeBaseDetailsPage";
import SchoolSettingsPage from "./pages/schools/SchoolSettingsPage";
import DiscountsPage from "./pages/schools/DiscountsPage";
import ManualPaymentEntryPage from "./pages/ManualPaymentEntryPage";
import MarketingLinksPage from '@/pages/MarketingLinksPage';
import ParentDashboard from "./components/dashboards/ParentDashboard";
import ParentAppShell from "./components/layout/ParentAppShell";
import AIStatusProvider from "@/contexts/AIStatusContext";
import RoleSelectionComponent from "@/components/RoleSelection";
import EducatorDashboard from "./components/dashboards/EducatorDashboard";
import AppShell from "./components/layout/AppShell";
import AIStatusPanel from "./components/AIStatusPanel";
import AllSchoolsPage from "./pages/superadmin/AllSchoolsPage";
import SchoolDetailsPage from "./pages/superadmin/SchoolDetailsPage";
import SuperAdminSchoolEditPage from "./pages/superadmin/SchoolEditPage";
import InvitationsPage from "./pages/superadmin/InvitationsPage";
import SchoolApplicationsPage from './pages/superadmin/SchoolApplicationsPage';
import SchoolApplicationPage from './pages/SchoolApplicationPage';
import SchoolApplicationSuccessPage from './pages/SchoolApplicationSuccessPage';
import SchoolApplicationStatusPage from './pages/SchoolApplicationStatusPage';
import LocationManagementPage from "./pages/schools/LocationManagementPage";
import NotificationManagementPage from "@/pages/NotificationManagementPage";
import DailyFlowsPage from "./pages/DailyFlows/DailyFlowsPage";

function DashboardRouter() {
  const { user } = useAuth();
  const { activeRole, showRoleSelection, setActiveRole } = useRole();

  console.log(`🚀 DashboardRouter called!`);
  console.log(`🔍 DashboardRouter - showRoleSelection:`, showRoleSelection, 'user email:', user?.email, 'activeRole:', activeRole);

  // Special handling for corey@americanseekersacademy.com - directly route to superAdmin dashboard
  if (user?.email === 'corey@americanseekersacademy.com') {
    console.log(`🏠 Routing superAdmin to EducatorDashboard with AppShell`);
    return (
      <AppShell key={`dashboard-superAdmin`}>
        <div className="mb-6">
          <AIStatusPanel />
        </div>
        <EducatorDashboard />
      </AppShell>
    );
  }

  // Show role selection screen if user needs to pick a role
  if (user?.email === 'coreycreates@gmail.com' && (!activeRole || showRoleSelection)) {
    console.log(`✅ Showing role selection for ${user.email}`);
    return (
      <RoleSelectionComponent
        onRoleSelect={setActiveRole}
        userEmail={user.email}
      />
    );
  }

  // Show dashboard based on selected role
  console.log(`🏠 Dashboard routing - activeRole:`, activeRole);

  // For parent - route to ParentDashboard with ParentAppShell
  if (activeRole === 'parent') {
    console.log('🏠 Routing parent to ParentDashboard');
    return (
      <ParentAppShell key={`dashboard-${activeRole}`}>
        <ParentDashboard />
      </ParentAppShell>
    );
  }

  // For super admin, admin, educator - route to EducatorDashboard with AppShell and AI tools
  if (['superAdmin', 'admin', 'educator'].includes(activeRole)) {
    console.log(`🎯 Routing ${activeRole} to EducatorDashboard with AI tools`);
    return (
      <AppShell key={`dashboard-${activeRole}`}>
        <div className="mb-6">
          <AIStatusPanel />
        </div>
        <EducatorDashboard />
      </AppShell>
    );
  }

  // For school admin - route to school admin interface
  if (['school_admin', 'schoolAdmin'].includes(activeRole)) {
    console.log(`🏫 Routing school admin to MySchoolPage`);
    return <MySchoolPage key={`dashboard-${activeRole}`} />;
  }

  // Default fallback - show loading while role is being determined
  if (!activeRole) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  // Final fallback to school admin page
  console.log(`🔄 Default routing to MySchoolPage for role:`, activeRole);
  return <MySchoolPage key={`dashboard-${activeRole}`} />;
}

function Router() {
  const { isAuthenticated, isLoading, user, error } = useAuth();
  const { activeRole, showRoleSelection, setActiveRole } = useRole();
  const [location, setLocation] = useLocation();

  console.log(`🔐 Router render - activeRole:`, activeRole, 'isAuthenticated:', isAuthenticated, 'showRoleSelection:', showRoleSelection, 'user:', user?.email, 'location:', location);

  // Ensure consistent hook usage - always call useEffect before conditional returns
  useEffect(() => {
    // This ensures hooks are called in consistent order
    console.log('Router effect - activeRole:', activeRole, 'isAuthenticated:', isAuthenticated);
  }, [activeRole, isAuthenticated]);

  // Handle redirects in useEffect to avoid state updates during render
  useEffect(() => {
    // Redirect to login if not authenticated (except for public routes)
    if (!isAuthenticated && !isLoading && !['/login', '/auth-callback', '/register', '/emergency-logout', '/auth/logout', '/forgot-password', '/reset-password'].includes(location) && !location.startsWith('/accept-invitation') && !location.startsWith('/school-registration') && !location.startsWith('/accept-educator-invitation') && !location.startsWith('/register/') && !location.startsWith('/school/')) {
      console.log(`🔒 Redirecting unauthenticated user from ${location} to login`);
      setLocation('/login');
    }

    // Redirect authenticated users away from login page
    if (isAuthenticated && location === '/login' && activeRole) {
      console.log(`🔄 Redirecting authenticated user away from login page`);
      setLocation('/dashboard');
    }
  }, [isAuthenticated, isLoading, location, activeRole, setLocation]);

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

  // Emergency logout for stuck users
  if (location === '/emergency-logout') {
    localStorage.clear();
    sessionStorage.clear();
    // Clear Supabase session
    import('@supabase/supabase-js').then(({ createClient }) => {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      if (supabaseUrl && supabaseAnonKey) {
        const supabase = createClient(supabaseUrl, supabaseAnonKey);
        supabase.auth.signOut();
      }
    });
    window.location.href = '/login';
    return <div>Logging out...</div>;
  }

  // Force role selection for multi-role users only on dashboard-related paths
  const multiRoleEmails = ['coreycreates@gmail.com', 'corey@americanseekersacademy.com'];
  if (isAuthenticated && user?.email && multiRoleEmails.includes(user.email) && showRoleSelection &&
      (location === '/' || location === '/dashboard' || location.startsWith('/admin') || location.startsWith('/programs'))) {
    console.log(`🎯 Forcing role selection for multi-role user at location: ${location}`);
    return (
      <div>
        <div style={{ position: 'absolute', top: '10px', right: '10px' }}>
          <a href="/emergency-logout" style={{ color: 'red', textDecoration: 'underline' }}>Emergency Logout</a>
        </div>
        <RoleSelectionComponent
          onRoleSelect={setActiveRole}
          userEmail={user.email}
        />
      </div>
    );
  }

  return (
    <Switch>
      <Route path="/auth/login" component={AuthLogin} />
      <Route path="/logout" component={LogoutPage} />
      <Route path="/auth/logout" component={LogoutPage} />
      <Route path="/auth/callback" component={AuthCallback} />
      <Route path="/accept-invitation" component={AcceptInvitationPage} />
      <Route path="/accept-educator-invitation" component={AcceptEducatorInvitationPage} />
      <Route path="/forgot-password" component={ForgotPasswordPage} />
      <Route path="/reset-password" component={ResetPasswordPage} />
      <Route path="/login" component={SupabaseLogin} />
      <Route path="/auth0-login" component={DirectAuth0Login} />
      <Route path="/embedded-login" component={EmbeddedLogin} />
      <Route path="/old-login" component={Login} />
      <Route path="/school-admin-login" component={SchoolAdminLogin} />
      <Route path="/register" component={Register} />


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
      <Route path="/checkout/success" component={CheckoutSuccess} />
      {/* Cart routes */}
          <Route path="/cart/checkout">
            {isAuthenticated ? (
              <CartCheckout />
            ) : (
              <Redirect to="/login" />
            )}
          </Route>
          <Route path="/cart/success">
            {isAuthenticated ? (
              <CartSuccess />
            ) : (
              <Redirect to="/login" />
            )}
          </Route>
      <Route path="/billing">
        {isAuthenticated ? (
          <BillingPage />
        ) : (
          <Redirect to="/login" />
        )}
      </Route>
      <Route path="/payment-plans" component={() => {
            const PaymentPlansPage = React.lazy(() => import('./pages/PaymentPlansPage'));
            return (
              <React.Suspense fallback={<div>Loading...</div>}>
                <PaymentPlansPage />
              </React.Suspense>
            );
          }} />

          <Route path="/class-payment-plans/:classId">
            {(params) => {
              // Mock data for now - in production this would be fetched based on params.classId
              const mockClassData = {
                id: params?.classId || '1',
                title: 'Sample Class',
                price: 50000, // $500 in cents
                depositRequired: 5000, // $50 in cents
                school: 'LearnSphere Academy',
                schedule: 'Mon, Wed, Fri 10:00-11:00 AM'
              };

              return (
                <ClassPaymentPlans
                  classData={mockClassData}
                  childName="Student"
                  onSelectPlan={(plan) => console.log('Selected plan:', plan)}
                />
              );
            }}
          </Route>

      {/* Authenticated registration system routes */}
      <Route path="/registration" component={RegistrationPage} />
      <Route path="/programs" component={ProgramsParentPage} />
      <Route path="/programs/browse" component={ProgramsBrowseRedirect} />

      {/* Educator routes */}
      <Route path="/educator" component={() => <AppShell><EducatorDashboard /></AppShell>} />
      <Route path="/educator/classes" component={() => <AppShell><EducatorClassesPage /></AppShell>} />
      <Route path="/educator/classes/:id" component={() => <AppShell><EducatorClassDetailsPage /></AppShell>} />
      <Route path="/educator/students" component={() => <AppShell><EducatorStudentsPage /></AppShell>} />
      <Route path="/educator/schedule" component={SchedulePage} />
      <Route path="/educator/notifications" component={() => <AppShell><EducatorNotificationsPage /></AppShell>} />
      
      {/* Daily Flow routes */}
      <Route path="/educator/daily-flows" component={() => <AppShell><DailyFlowsPage /></AppShell>} />
      <Route path="/schools/daily-flows/templates" component={() => <AppShell><DailyFlowsPage /></AppShell>} />
      <Route path="/schools/daily-flows/entries" component={() => <AppShell><DailyFlowsPage /></AppShell>} />
      <Route path="/schools/daily-flows/reports" component={() => <AppShell><DailyFlowsPage /></AppShell>} />
      <Route path="/schools/daily-flows" component={() => <AppShell><DailyFlowsPage /></AppShell>} />
      
      <Route path="/children" component={ChildrenPage} />
      <Route path="/children/view" component={ChildrenViewPage} />
      <Route path="/children/register" component={ChildRegistrationPage} />
      <Route path="/children/register/confirm" component={ChildRegistrationConfirmation} />
      <Route path="/children/register/success" component={ChildRegistrationSuccess} />
      <Route path="/children/:id" component={ChildProfilePage} />
      <Route path="/children/:id/edit" component={ChildProfileEditPage} />
      <Route path="/children/:id/enrollments" component={ChildEnrollmentsPage} />
      <Route path="/calendar" component={CalendarPage} />
      <Route path="/schedule" component={SchedulePage} />
      <Route path="/payments" component={PaymentsPage} />
      <Route path="/payment">
        <Redirect to="/cart/checkout" />
      </Route>
      <Route path="/payment-history">
        {isAuthenticated ? (
          <PaymentHistoryPage />
        ) : (
          <Redirect to="/login" />
        )}
      </Route>
      <Route path="/settings" component={SettingsPage} />
      <Route path="/school-settings" component={SchoolSettings} />
      <Route path="/enrollment-assistant" component={EnrollmentAssistantPage} />
      <Route path="/ai-insights" component={AIInsightsDashboard} />

      {/* Dashboard route */}
      <Route path="/dashboard" component={DashboardRouter} />

      {/* School/Co-op registration routes */}
      <Route path="/schools/register" component={SchoolRegistrationPage} />
      <Route path="/schools/register/confirm" component={SchoolRegistrationConfirmationPage} />

      {/* School-specific landing and registration pages */}
      <Route path="/school/:code" component={SchoolLandingPage} />
      <Route path="/register/:code" component={RegistrationLandingPage} />
      <Route path="/registration-success/:code" component={RegistrationSuccessPage} />

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
      <Route path="/schools/staff/:id" component={StaffEditPage} />
      <Route path="/schools/staff/:id/edit" component={StaffEditPage} />
      <Route path="/schools/students" component={StudentsPage} />
      <Route path="/schools/students/:id" component={StudentDetailPage} />
      <Route path="/schools/students/:id/edit" component={StudentRegistrationPage} />
      <Route path="/schools/students/:id/classes" component={StudentClassesPage} />
      <Route path="/schools/students/register" component={StudentRegistrationPage} />
      <Route path="/schools/discounts" component={DiscountsPage} />
      <Route path="/schools/manual-payments">
        <AppShell>
          <ManualPaymentEntryPage />
        </AppShell>
      </Route>
      <Route path="/schools/knowledge-base/:id" component={KnowledgeBaseDetailsPage} />
      <Route path="/schools/knowledge-base" component={KnowledgeBasePage} />
      <Route path="/schools/marketing-links" component={MarketingLinksPage} />
      <Route path="/schools/locations">
        <AppShell>
          <LocationManagementPage />
        </AppShell>
      </Route>
      <Route path="/schools/notifications">
        <AppShell>
          <NotificationManagementPage />
        </AppShell>
      </Route>
      <Route path="/schools/contact-import" component={SchoolContactImportPage} />
      <Route path="/schools/settings" component={SchoolSettings} />

      {/* SuperAdmin routes */}
      <Route path="/superadmin/schools" component={AllSchoolsPage} />
      <Route path="/superadmin/schools/:id" component={SchoolDetailsPage} />
      <Route path="/superadmin/schools/:id/edit" component={SuperAdminSchoolEditPage} />
      <Route path="/superadmin/applications" component={SchoolApplicationsPage} />

      {/* School Application routes */}
      <Route path="/school-application" component={SchoolApplicationPage} />
      <Route path="/school-application-success" component={SchoolApplicationSuccessPage} />
      <Route path="/school-application-status" component={SchoolApplicationStatusPage} />

      {/* Admin routes */}
      <Route path="/admin/classes" component={SimpleClassesPage} />
      <Route path="/admin/classes/new" component={ClassCreationPage} />
      <Route path="/admin/classes/upload" component={ClassesUploadPage} />
      <Route path="/admin/contact-import" component={ContactImportPage} />
      <Route path="/admin/roles" component={RolesAndPermissionsPage} />
      <Route path="/admin/role-management" component={RoleManagementPage} />
      <Route path="/admin/features" component={FeaturesOverviewPage} />
      <Route path="/admin/classes/edit/:id" component={ClassCreationPage} />
      <Route path="/admin/classes/:classId/enrollments" component={() => React.lazy(() => import('./pages/admin/ClassEnrollmentsPage'))} />
      <Route path="/admin/programs" component={Dashboard} />
      <Route path="/admin/programs/:rest*" component={Dashboard} />
      <Route path="/admin/users" component={Dashboard} />
      <Route path="/admin/users/:rest*" component={Dashboard} />
      <Route path="/admin/reports" component={Dashboard} />
      <Route path="/admin/reports/:rest*" component={Dashboard} />
      <Route path="/admin" component={Dashboard} />

      {/* Root path route for authenticated users */}
      {isAuthenticated ? (
        <Route path="/" component={DashboardRouter} />
      ) : (
        <Route path="/" component={SupabaseLogin} />
      )}

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <SupabaseProvider>
        <RoleProvider>
          <NotificationProvider>
            <AIStatusProvider>
              <CartProvider>
                <TooltipProvider>
                  <Toaster />
                  <Router />
                  <SupportAssistantTrigger />
                </TooltipProvider>
              </CartProvider>
            </AIStatusProvider>
          </NotificationProvider>
        </RoleProvider>
      </SupabaseProvider>
    </QueryClientProvider>
  );
}

export default App;