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
import { FormTracker } from "@/components/FormTracker";
import { InteractiveTutorialProvider } from "@/components/tutorials/InteractiveTutorial";
import PaymentHelpAssistant from "@/components/payments/PaymentHelpAssistant";

import Home from "@/pages/Home";
import Login from "@/pages/Login";
import { SupabaseLogin } from "@/components/auth/SupabaseLogin";
import EmbeddedLogin from "@/components/auth/EmbeddedLogin";
import DirectAuth0Login from "@/components/auth/DirectAuth0Login";
import Register from "@/pages/Register";

import { SupportAssistantTrigger } from "@/components/AISupportAssistant";
import LogoutPage from "@/pages/LogoutPage";
import AuthCallback from "@/pages/AuthCallback";
import AcceptInvitationPage from "@/pages/AcceptInvitationPage";
import AcceptEducatorInvitationPage from "./pages/AcceptEducatorInvitationPage";
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';

// Eagerly imported to avoid suspension errors with wouter's synchronous navigation
import SchoolClassEnrollmentsPage from './pages/schools/ClassEnrollmentsPage';
import AdminClassEnrollmentsPage from './pages/admin/ClassEnrollmentsPage';
import AnnouncementsPage from './pages/schools/AnnouncementsPage';
import NotificationTrackingPage from './pages/schools/NotificationTrackingPage';
import SchoolCalendarPage from './pages/schools/CalendarPage';

// Lazy-loaded pages for code splitting
const SchoolAdminLogin = lazy(() => import("@/pages/SchoolAdminLogin"));
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const PaymentsPage = lazy(() => import("@/pages/PaymentsPage"));
const SchedulePage = lazy(() => import("@/pages/SchedulePage"));
const Curriculum = lazy(() => import("@/pages/Curriculum"));
const CurriculumDetail = lazy(() => import("@/pages/CurriculumDetail"));
const Lessons = lazy(() => import("@/pages/Lessons"));
const AILessonGenerator = lazy(() => import("@/pages/AILessonGenerator"));
const AIWorksheetGenerator = lazy(() => import("@/pages/AIWorksheetGenerator"));
const OCRWorksheetGenerator = lazy(() => import("@/pages/OCRWorksheetGenerator"));
const KnowledgeBase = lazy(() => import("@/pages/KnowledgeBase"));
const KnowledgeBaseDetail = lazy(() => import("@/pages/KnowledgeBaseDetail"));
const KnowledgeBaseEdit = lazy(() => import("@/pages/KnowledgeBaseEdit"));
const Checkout = lazy(() => import("@/pages/Checkout"));
const CheckoutSuccess = lazy(() => import("@/pages/CheckoutSuccess"));
const CartCheckout = lazy(() => import("@/pages/CartCheckout"));
const CartSuccess = lazy(() => import("@/pages/CartSuccess"));
const MembershipSuccess = lazy(() => import("@/pages/MembershipSuccess"));
const MembershipAgreementPage = lazy(() => import("@/pages/MembershipAgreementPage"));
const RegistrationPage = lazy(() => import("@/pages/RegistrationPage").then(m => ({ default: m.RegistrationPage })));
const ProgramsParentPage = lazy(() => import("@/pages/ProgramsParentPage"));
const ParentConciergePage = lazy(() => import("@/pages/ParentConciergePage"));
const ParentClassDetailsPage = lazy(() => import("@/pages/parents/ParentClassDetailsPage"));
const MyDocumentsPage = lazy(() => import("@/pages/parent/MyDocumentsPage"));
const DocumentDetailPage = lazy(() => import("@/pages/parent/DocumentDetailPage"));
const MyAssessmentsPage = lazy(() => import("@/pages/parent/MyAssessmentsPage"));
const SimpleClassesPage = lazy(() => import("./pages/SimpleClassesPage").then(m => ({ default: m.SimpleClassesPage })));
const StaffInvitePage = lazy(() => import("./pages/schools/StaffInvitePage"));
const StaffPositionsPage = lazy(() => import("./pages/schools/StaffPositionsPage"));
const KnowledgeBaseCreationPage = lazy(() => import("./pages/schools/KnowledgeBaseCreationPage"));
const KnowledgeBaseUsePage = lazy(() => import("./pages/schools/KnowledgeBaseUsePage"));
const FormBuilderPage = lazy(() => import("./pages/schooladmin/FormBuilderPage"));
const FormEditorPage = lazy(() => import("./pages/schooladmin/FormEditorPage"));
const PreviewFormPage = lazy(() => import("./pages/schooladmin/PreviewFormPage"));
const SubmissionsPage = lazy(() => import("./pages/schooladmin/SubmissionsPage"));
const DocumentManagementPage = lazy(() => import("./pages/schooladmin/DocumentManagementPage"));
const AssessmentManagementPage = lazy(() => import("./pages/schooladmin/AssessmentManagementPage"));
const CreditManagementPage = lazy(() => import("./pages/schooladmin/CreditManagementPage"));
const FundraiserManagementPage = lazy(() => import("./pages/schooladmin/FundraiserManagementPage"));
const StaffPermissionsPage = lazy(() => import("./pages/schooladmin/StaffPermissionsPage"));
const LocationEnrollmentsPage = lazy(() => import("./pages/schooladmin/LocationEnrollmentsPage"));
const RefundHistoryPage = lazy(() => import("./pages/schooladmin/RefundHistoryPage"));
const FinancialReportsPage = lazy(() => import("./pages/schooladmin/FinancialReportsPage"));
const FundraiserStorePage = lazy(() => import("./pages/FundraiserStorePage"));
const FundraiserSuccessPage = lazy(() => import("./pages/FundraiserSuccessPage"));
const DynamicFormPage = lazy(() => import("./pages/DynamicFormPage"));
const ProductOrderFormPage = lazy(() => import("./pages/ProductOrderFormPage"));
const ProductOrderPaymentPage = lazy(() => import("./pages/ProductOrderPaymentPage"));
const OrderConfirmationPage = lazy(() => import("./pages/OrderConfirmationPage"));
const RolesAndPermissionsPage = lazy(() => import("@/pages/admin/RolesAndPermissionsPage"));
const RoleManagementPage = lazy(() => import("@/pages/admin/RoleManagementPage"));
const FeaturesOverviewPage = lazy(() => import("@/pages/admin/FeaturesOverviewPage"));
const SystemErrorsPage = lazy(() => import("@/pages/admin/SystemErrorsPage"));
const VolunteerCreditsPage = lazy(() => import("@/pages/admin/VolunteerCreditsPage"));
const ChildRegistrationPage = lazy(() => import("@/pages/ChildRegistrationPage"));
const ChildRegistrationConfirmation = lazy(() => import("@/pages/ChildRegistrationConfirmation"));
const ChildRegistrationSuccess = lazy(() => import("@/pages/ChildRegistrationSuccess"));
const ChildrenPage = lazy(() => import("@/pages/ChildrenPage"));
const ChildrenViewPage = lazy(() => import("@/pages/children/ChildrenViewPage"));
const ChildProfilePage = lazy(() => import("@/pages/children/ChildProfilePage"));
const ChildProfileEditPage = lazy(() => import("@/pages/ChildProfileEditPage"));
const ChildEnrollmentsPage = lazy(() => import("@/pages/children/ChildEnrollmentsPage"));
const ClassesUploadPage = lazy(() => import("./pages/admin/ClassesUploadPage"));
const ClassCreationPage = lazy(() => import("./pages/admin/ClassCreationPage"));
const ContactImportPage = lazy(() => import("./pages/admin/ContactImportPage"));
const SchoolContactImportPage = lazy(() => import("./pages/schools/ContactImportPage"));
const UsersPage = lazy(() => import("./pages/schools/UsersPage"));
const ParentProfilePage = lazy(() => import("./pages/schools/ParentProfilePage"));
const EducatorProfilePage = lazy(() => import("./pages/schools/EducatorProfilePage"));
const StaffProfilePage = lazy(() => import("./pages/schools/StaffProfilePage"));
const AdminProfilePage = lazy(() => import("./pages/schools/AdminProfilePage"));
const ClassesPage = lazy(() => import("./pages/ClassesPage"));
const CalendarPage = lazy(() => import("./pages/CalendarPage"));
const ProgramsBrowseRedirect = lazy(() => import("@/pages/ProgramsBrowseRedirect"));
const EnrollmentAssistantPage = lazy(() => import("@/pages/EnrollmentAssistantPage"));
const AIInsightsDashboard = lazy(() => import("@/pages/AIInsightsDashboard"));
const SchoolRegistrationPage = lazy(() => import("@/pages/SchoolRegistrationPage"));
const SchoolRegistrationConfirmationPage = lazy(() => import("@/pages/SchoolRegistrationConfirmationPage"));
const SchoolLandingPage = lazy(() => import("@/pages/SchoolLandingPage"));
const SchoolRegistrationFormPage = lazy(() => import("@/pages/SchoolRegistrationFormPage"));
const RegistrationSuccessPage = lazy(() => import("@/pages/RegistrationSuccessPage"));
const BillingPage = lazy(() => import("@/pages/BillingPage"));
const PaymentSuccess = lazy(() => import("@/pages/PaymentSuccess"));
const PaymentHistoryPage = lazy(() => import("@/pages/PaymentHistoryPage"));
const PlatformSubscriptionPlans = lazy(() => import("@/pages/PaymentPlans"));
const ClassPaymentPlans = lazy(() => import("@/pages/ClassPaymentPlans"));
const SettingsPage = lazy(() => import("@/pages/SettingsPage"));
const NotificationsPage = lazy(() => import("@/pages/NotificationsPage"));
const EducatorClassesPage = lazy(() => import('./pages/educator/EducatorClassesPage'));
const EducatorClassDetailsPage = lazy(() => import('./pages/educator/EducatorClassDetailsPage'));
const EducatorStudentsPage = lazy(() => import('./pages/educator/EducatorStudentsPage'));
const EducatorStudentDetailPage = lazy(() => import('./pages/educator/EducatorStudentDetailPage'));
const EducatorNotificationsPage = lazy(() => import('./pages/educator/EducatorNotificationsPage'));
const EducatorDashboardPage = lazy(() => import('./pages/educator/EducatorDashboard'));
const EducatorSchedulePage = lazy(() => import('./pages/educator/EducatorSchedulePage'));
const EducatorSettingsPage = lazy(() => import('./pages/educator/EducatorSettingsPage'));
const MyClassesPage = lazy(() => import('./pages/educator/MyClasses'));
const WeeklyCalendarPage = lazy(() => import('./pages/educator/WeeklyCalendar'));
const MyHoursPage = lazy(() => import('./pages/educator/MyHours'));
const ActiveSessionPage = lazy(() => import('./pages/educator/ActiveSession'));
const StartSessionPage = lazy(() => import('./pages/educator/StartSession'));
const EducatorAssessmentsPage = lazy(() => import('./pages/educator/EducatorAssessmentsPage'));
const StaffGuidePage = lazy(() => import('./pages/educator/StaffGuidePage'));

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
import MySchoolPage from "./pages/schools/MySchoolPage";
import ParentDashboard from "./components/dashboards/ParentDashboard";
import ParentAppShell from "./components/layout/ParentAppShell";
import EducatorAppShell from "./components/layout/EducatorAppShell";
import AIStatusProvider from "@/contexts/AIStatusContext";
import RoleSelectionComponent from "@/components/RoleSelection";
import EducatorDashboard from "./components/dashboards/EducatorDashboard";
import AppShell from "./components/layout/AppShell";
import SchoolAdminLayout from "./components/layout/SchoolAdminLayout";
import AIStatusPanel from "./components/AIStatusPanel";

// Lazy-loaded pages for code splitting (second group)
const RegistrationLandingPage = lazy(() => import("@/pages/RegistrationLandingPage"));
const RegistrationPaymentPage = lazy(() => import("@/pages/RegistrationPaymentPage"));
const SchoolEditPage = lazy(() => import("./pages/schools/SchoolEditPage"));
const SchoolClassesPage = lazy(() => import("./pages/schools/ClassesPage"));
const SchoolClassCreationPage = lazy(() => import("./pages/schools/SchoolClassCreationPage"));
const SchoolClassDetailsPage = lazy(() => import("./pages/schools/SchoolClassDetailsPage"));
const ClassRosterPage = lazy(() => import("./pages/schools/ClassRosterPage"));
const StaffPage = lazy(() => import("./pages/schools/StaffPage"));
const EducatorManagementPage = lazy(() => import("./pages/schools/EducatorManagementPage"));
const StaffHoursPage = lazy(() => import("./pages/schools/StaffHoursPage"));
const StaffEditPage = lazy(() => import("./pages/schools/StaffEditPage"));
const StudentsPage = lazy(() => import("./pages/schools/StudentsPage"));
const StudentDetailPage = lazy(() => import("./pages/schools/StudentDetailPage"));
const StudentRegistrationPage = lazy(() => import("./pages/schools/StudentRegistrationPage"));
const StudentClassesPage = lazy(() => import("./pages/schools/StudentClassesPage"));
const KnowledgeBasePage = lazy(() => import("./pages/schools/KnowledgeBasePage"));
const KnowledgeBaseDetailsPage = lazy(() => import("./pages/schools/KnowledgeBaseDetailsPage"));
const SchoolSettingsPage = lazy(() => import("./pages/schools/SchoolSettingsPage"));
const AttendanceManagementPage = lazy(() => import("./pages/schools/AttendanceManagementPage"));
const DiscountsPage = lazy(() => import("./pages/schools/DiscountsPage"));
const MembershipManagementPage = lazy(() => import("./pages/schools/MembershipManagementPage"));
const ManualPaymentEntryPage = lazy(() => import("./pages/ManualPaymentEntryPage"));
const MarketingLinksPage = lazy(() => import('@/pages/MarketingLinksPage'));
const AllSchoolsPage = lazy(() => import("./pages/superadmin/AllSchoolsPage"));
const SchoolDetailsPage = lazy(() => import("./pages/superadmin/SchoolDetailsPage"));
const SuperAdminSchoolEditPage = lazy(() => import("./pages/superadmin/SchoolEditPage"));
const InvitationsPage = lazy(() => import("./pages/superadmin/InvitationsPage"));
const SchoolApplicationsPage = lazy(() => import('./pages/superadmin/SchoolApplicationsPage'));
const SchoolApplicationPage = lazy(() => import('./pages/SchoolApplicationPage'));
const SchoolApplicationSuccessPage = lazy(() => import('./pages/SchoolApplicationSuccessPage'));
const SchoolApplicationStatusPage = lazy(() => import('./pages/SchoolApplicationStatusPage'));
const LocationManagementPage = lazy(() => import("./pages/schools/LocationManagementPage"));
const CategoriesManagementPage = lazy(() => import("./pages/schools/CategoriesManagementPage"));
const NotificationManagementPage = lazy(() => import("@/pages/NotificationManagementPage"));
const DailyFlowsPage = lazy(() => import("./pages/DailyFlows/DailyFlowsPage"));
const EnrollmentsAdminPage = lazy(() => import("./pages/schools/EnrollmentsAdminPage"));

function DashboardRouter() {
  const { user } = useAuth();
  const { activeRole, showRoleSelection, setActiveRole } = useRole();

  console.log(`🚀 DashboardRouter called!`);
  console.log(`🔍 DashboardRouter - showRoleSelection:`, showRoleSelection, 'user email:', user?.email, 'activeRole:', activeRole);

  // Show dashboard based on selected role (roles come from database via RoleContext)
  console.log(`🏠 Dashboard routing - activeRole:`, activeRole);

  // For parent - route to AI Concierge as default landing page
  if (activeRole === 'parent') {
    console.log('🏠 Routing parent to AI Concierge');
    return (
      <ParentAppShell key={`dashboard-${activeRole}`}>
        <ParentConciergePage />
      </ParentAppShell>
    );
  }

  // For educator, mentor - route to EducatorDashboard with EducatorAppShell
  if (['educator', 'mentor'].includes(activeRole)) {
    console.log(`🎯 Routing ${activeRole} to EducatorDashboard with EducatorAppShell`);
    return (
      <EducatorAppShell key={`dashboard-${activeRole}`}>
        <EducatorDashboard />
      </EducatorAppShell>
    );
  }

  // For super admin, admin - route to EducatorDashboard with AppShell and AI tools
  if (['superAdmin', 'admin'].includes(activeRole)) {
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
  if (['schoolAdmin'].includes(activeRole)) {
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

  // If we reach here, the role is not recognized
  console.error(`❌ Unknown role: ${activeRole}`);
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <h2 className="text-xl font-semibold mb-2">Role Not Recognized</h2>
        <p className="text-gray-600">Your role "{activeRole}" is not configured. Please contact support.</p>
      </div>
    </div>
  );
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
    if (!isAuthenticated && !isLoading && !['/login', '/auth-callback', '/register', '/emergency-logout', '/auth/logout', '/forgot-password', '/reset-password'].includes(location) && !location.startsWith('/accept-invitation') && !location.startsWith('/school-registration') && !location.startsWith('/accept-educator-invitation') && !location.startsWith('/register/') && !location.startsWith('/school/') && !location.startsWith('/forms/')) {
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

  return (
    <React.Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>}>
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
          <Route path="/cart">
            {isAuthenticated ? (
              <CartCheckout />
            ) : (
              <Redirect to="/login" />
            )}
          </Route>
          <Route path="/cart/checkout">
            {isAuthenticated ? (
              <CartCheckout />
            ) : (
              <Redirect to="/login" />
            )}
          </Route>
          <Route path="/payment-success">
            {isAuthenticated ? (
              <PaymentSuccess />
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
          <Route path="/membership-success">
            {isAuthenticated ? (
              <MembershipSuccess />
            ) : (
              <Redirect to="/login" />
            )}
          </Route>
          <Route path="/membership-agreement">
            {isAuthenticated ? (
              <MembershipAgreementPage />
            ) : (
              <Redirect to="/login" />
            )}
          </Route>
      <Route path="/billing">
        <Redirect to="/payments" />
      </Route>
      <Route path="/payment-plans" component={PlatformSubscriptionPlans} />

          <Route path="/class-payment-plans/:classId">
            {(params) => {
              // Mock data for now - in production this would be fetched based on params.classId
              const mockClassData = {
                id: params?.classId || '1',
                title: 'Sample Class',
                price: 50000, // $500 in cents
                depositRequired: 5000, // $50 in cents
                school: 'American Seekers Academy',
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
      
      {/* Backward compatibility redirects */}
      <Route path="/programs">
        <Redirect to="/parent/programs" />
      </Route>
      <Route path="/programs/browse">
        <Redirect to="/parent/programs/browse" />
      </Route>
      
      {/* Parent routes */}
      <Route path="/parent/concierge" component={() => <ParentAppShell><ParentConciergePage /></ParentAppShell>} />
      <Route path="/parent/home" component={() => <ParentAppShell><ParentDashboard /></ParentAppShell>} />
      <Route path="/parent/programs/browse" component={ProgramsBrowseRedirect} />
      <Route path="/parent/programs" component={ProgramsParentPage} />
      <Route path="/parent/programs/:rest*" component={ProgramsParentPage} />
      <Route path="/parent/classes/:id" component={ParentClassDetailsPage} />
      <Route path="/parent/documents" component={MyDocumentsPage} />
      <Route path="/parent/documents/:id" component={DocumentDetailPage} />
      <Route path="/parent/assessments" component={MyAssessmentsPage} />

      {/* Educator routes - using EducatorAppShell for dedicated navigation */}
      <Route path="/educator" component={() => <EducatorAppShell><EducatorDashboardPage /></EducatorAppShell>} />
      <Route path="/educator/dashboard" component={() => <EducatorAppShell><EducatorDashboardPage /></EducatorAppShell>} />
      <Route path="/educator/my-classes" component={() => <EducatorAppShell><MyClassesPage /></EducatorAppShell>} />
      <Route path="/educator/session/:id" component={() => <EducatorAppShell><ActiveSessionPage /></EducatorAppShell>} />
      <Route path="/educator/weekly-calendar" component={() => <EducatorAppShell><WeeklyCalendarPage /></EducatorAppShell>} />
      <Route path="/educator/my-hours" component={() => <EducatorAppShell><MyHoursPage /></EducatorAppShell>} />
      <Route path="/educator/classes" component={() => <EducatorAppShell><EducatorClassesPage /></EducatorAppShell>} />
      <Route path="/educator/classes/:id" component={() => <EducatorAppShell><EducatorClassDetailsPage /></EducatorAppShell>} />
      <Route path="/educator/classes/:id/start-session" component={() => <EducatorAppShell><StartSessionPage /></EducatorAppShell>} />
      <Route path="/educator/students" component={() => <EducatorAppShell><EducatorStudentsPage /></EducatorAppShell>} />
      <Route path="/educator/students/:id" component={() => <EducatorAppShell><EducatorStudentDetailPage /></EducatorAppShell>} />
      <Route path="/educator/schedule" component={() => <EducatorAppShell><EducatorSchedulePage /></EducatorAppShell>} />
      <Route path="/educator/settings" component={() => <EducatorAppShell><EducatorSettingsPage /></EducatorAppShell>} />
      <Route path="/educator/notifications" component={() => <EducatorAppShell><EducatorNotificationsPage /></EducatorAppShell>} />
      <Route path="/educator/assessments" component={() => <EducatorAppShell><EducatorAssessmentsPage /></EducatorAppShell>} />
      <Route path="/educator/staff-guide" component={() => <EducatorAppShell><StaffGuidePage /></EducatorAppShell>} />
      
      {/* Daily Flow routes */}
      <Route path="/educator/daily-flows" component={() => <EducatorAppShell><DailyFlowsPage /></EducatorAppShell>} />
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
      <Route path="/notifications" component={NotificationsPage} />
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
      <Route path="/schools/classes/:id" component={SchoolClassDetailsPage} />
      <Route path="/schools/classes/:id/edit" component={SchoolClassCreationPage} />
      <Route path="/schools/classes/:id/roster" component={ClassRosterPage} />
      <Route path="/schools/classes/:id/enrollments" component={SchoolClassEnrollmentsPage} />
      <Route path="/schools/staff" component={StaffPage} />
      <Route path="/schools/staff/invite" component={StaffInvitePage} />
      <Route path="/schools/staff-hours" component={StaffHoursPage} />
      <Route path="/schools/educators" component={EducatorManagementPage} />
      <Route path="/schools/educators/:educatorId" component={EducatorManagementPage} />
      <Route path="/schools/staff/positions" component={StaffPositionsPage} />
      <Route path="/school-admin/staff-positions" component={StaffPositionsPage} />
      <Route path="/school-admin/children" component={StudentsPage} />
      <Route path="/school-admin/forms" component={FormBuilderPage} />
      <Route path="/school-admin/forms/:id/edit" component={FormEditorPage} />
      <Route path="/school-admin/forms/:id/preview" component={PreviewFormPage} />
      <Route path="/school-admin/forms/:id/submissions" component={SubmissionsPage} />
      <Route path="/school-admin/documents" component={DocumentManagementPage} />
      <Route path="/school-admin/assessments" component={AssessmentManagementPage} />
      <Route path="/school-admin/attendance" component={AttendanceManagementPage} />
      <Route path="/school-admin/credits" component={CreditManagementPage} />
      <Route path="/school-admin/fundraisers" component={FundraiserManagementPage} />
      <Route path="/school-admin/staff-permissions" component={StaffPermissionsPage} />
      <Route path="/school-admin/location-enrollments" component={LocationEnrollmentsPage} />
      <Route path="/school-admin/refunds" component={RefundHistoryPage} />
      <Route path="/school-admin/financial-reports" component={FinancialReportsPage} />
      <Route path="/fundraiser/:campaignId/:familySlug">
        {(params) => <FundraiserStorePage campaignId={params?.campaignId || ''} familySlug={params?.familySlug || ''} />}
      </Route>
      <Route path="/fundraiser/success" component={FundraiserSuccessPage} />
      <Route path="/forms/:slug" component={DynamicFormPage} />
      <Route path="/product-order/:slug" component={ProductOrderFormPage} />
      <Route path="/payment/:submissionId" component={ProductOrderPaymentPage} />
      <Route path="/order-confirmation/:submissionId" component={OrderConfirmationPage} />
      <Route path="/schools/staff/:id/edit" component={StaffEditPage} />
      <Route path="/schools/students" component={StudentsPage} />
      <Route path="/schools/students/register" component={StudentRegistrationPage} />
      <Route path="/schools/students/:id" component={StudentDetailPage} />
      <Route path="/schools/students/:id/edit" component={StudentRegistrationPage} />
      <Route path="/schools/students/:id/classes" component={StudentClassesPage} />
      <Route path="/schools/enrollments" component={EnrollmentsAdminPage} />
      <Route path="/schools/memberships" component={MembershipManagementPage} />
      <Route path="/schools/discounts" component={DiscountsPage} />
      <Route path="/schools/manual-payments">
        <SchoolAdminLayout pageTitle="Manual Payments">
          <ManualPaymentEntryPage />
        </SchoolAdminLayout>
      </Route>
      <Route path="/schools/knowledge-base/create" component={KnowledgeBaseCreationPage} />
      <Route path="/schools/knowledge-base/:id/use" component={KnowledgeBaseUsePage} />
      <Route path="/schools/knowledge-base/:id" component={KnowledgeBaseDetailsPage} />
      <Route path="/schools/knowledge-base" component={KnowledgeBasePage} />
      <Route path="/schools/announcements" component={AnnouncementsPage} />
      <Route path="/schools/notification-tracking" component={NotificationTrackingPage} />
      <Route path="/schools/calendar" component={SchoolCalendarPage} />
      <Route path="/schools/marketing-links" component={MarketingLinksPage} />
      <Route path="/schools/locations">
        <SchoolAdminLayout pageTitle="Location Management">
          <LocationManagementPage />
        </SchoolAdminLayout>
      </Route>
      <Route path="/schools/categories">
        <SchoolAdminLayout pageTitle="Category Management">
          <CategoriesManagementPage />
        </SchoolAdminLayout>
      </Route>
      <Route path="/schools/notifications">
        <SchoolAdminLayout pageTitle="Notifications">
          <NotificationManagementPage />
        </SchoolAdminLayout>
      </Route>
      <Route path="/schools/contact-import" component={SchoolContactImportPage} />
      <Route path="/schools/users" component={UsersPage} />
      <Route path="/schools/parents/:parentId" component={ParentProfilePage} />
      <Route path="/schools/educators/:educatorId" component={EducatorProfilePage} />
      <Route path="/schools/staff/:staffId" component={StaffProfilePage} />
      <Route path="/schools/admins/:adminId" component={AdminProfilePage} />
      <Route path="/schools/settings" component={SchoolSettingsPage} />

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
      <Route path="/admin/system-errors" component={SystemErrorsPage} />
      <Route path="/admin/volunteer-credits" component={VolunteerCreditsPage} />
      <Route path="/admin/classes/edit/:id" component={ClassCreationPage} />
      <Route path="/admin/classes/:classId/enrollments" component={AdminClassEnrollmentsPage} />
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
    </React.Suspense>
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
                <InteractiveTutorialProvider>
                  <TooltipProvider>
                    <Toaster />
                    <FormTracker />
                    <Router />
                    <SupportAssistantTrigger />
                    <PaymentHelpAssistant />
                  </TooltipProvider>
                </InteractiveTutorialProvider>
              </CartProvider>
            </AIStatusProvider>
          </NotificationProvider>
        </RoleProvider>
      </SupabaseProvider>
    </QueryClientProvider>
  );
}

export default App;