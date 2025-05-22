import { Switch, Route } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

import Home from "@/pages/Home";
import Login from "@/pages/Login";
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
import { RegistrationPage } from "@/pages/RegistrationPage";
import { ProgramsPage } from "@/pages/ProgramsPage";
import ProgramsParentPage from "@/pages/ProgramsParentPage";
import { SimpleClassesPage } from "./pages/SimpleClassesPage";
import StaffInvitePage from "./pages/schools/StaffInvitePage";
import StaffPositionsPage from "./pages/schools/StaffPositionsPage";
import KnowledgeBaseCreationPage from "./pages/schools/KnowledgeBaseCreationPage";
import RolesAndPermissionsPage from "./pages/admin/RolesAndPermissionsPage";
import FeaturesOverviewPage from "./pages/admin/FeaturesOverviewPage";
import ChildRegistrationPage from "./pages/ChildRegistrationPage";
import ChildRegistrationConfirmation from "./pages/ChildRegistrationConfirmation";
import ChildRegistrationSuccess from "./pages/ChildRegistrationSuccess";
import ChildrenPage from "./pages/ChildrenPage";
import ChildrenViewPage from "./pages/children/ChildrenViewPage";
import ChildProfileEditPage from "./pages/ChildProfileEditPage";
import ClassesUploadPage from "./pages/admin/ClassesUploadPage";
import ClassCreationPage from "./pages/admin/ClassCreationPage";
import ClassesPage from "./pages/ClassesPage";
import CalendarPage from "./pages/CalendarPage";
import ProgramsBrowseRedirect from "./pages/ProgramsBrowseRedirect";
import EnrollmentAssistantPage from "@/pages/EnrollmentAssistantPage";
import SchoolRegistrationPage from "@/pages/SchoolRegistrationPage";
import SchoolRegistrationConfirmationPage from "@/pages/SchoolRegistrationConfirmationPage";
import NotFound from "@/pages/not-found";

// School Admin pages
import MySchoolPage from "./pages/schools/MySchoolPage";
import SchoolEditPage from "./pages/schools/SchoolEditPage";
import SchoolClassesPage from "./pages/schools/ClassesPage";
import SchoolClassCreationPage from "./pages/schools/SchoolClassCreationPage";
import StaffPage from "./pages/schools/StaffPage";
import StudentsPage from "./pages/schools/StudentsPage";
import KnowledgeBasePage from "./pages/schools/KnowledgeBasePage";
import KnowledgeBaseDetailsPage from "./pages/schools/KnowledgeBaseDetailsPage";
import { AuthProvider } from "@/hooks/useAuth";
import AIStatusProvider from "@/contexts/AIStatusContext";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/login" component={Login} />
      <Route path="/school-admin-login" component={SchoolAdminLogin} />
      <Route path="/register" component={Register} />
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
      <Route path="/children/register" component={ChildRegistrationPage} />
      <Route path="/children/register/confirm" component={ChildRegistrationConfirmation} />
      <Route path="/children/register/success" component={ChildRegistrationSuccess} />
      <Route path="/children/:id/edit" component={ChildProfileEditPage} />
      <Route path="/calendar" component={CalendarPage} />
      <Route path="/schedule" component={SchedulePage} />
      <Route path="/payments" component={PaymentsPage} />
      <Route path="/enrollment-assistant" component={EnrollmentAssistantPage} />
      
      {/* School/Co-op registration routes */}
      <Route path="/schools/register" component={SchoolRegistrationPage} />
      <Route path="/schools/register/confirm" component={SchoolRegistrationConfirmationPage} />
      
      {/* School Admin routes */}
      <Route path="/schools/my-school" component={MySchoolPage} />
      <Route path="/schools/my-school/edit" component={SchoolEditPage} />
      <Route path="/schools/classes" component={SchoolClassesPage} />
      <Route path="/schools/classes/new" component={SchoolClassCreationPage} />
      <Route path="/schools/classes/:id/edit" component={SchoolClassCreationPage} />
      <Route path="/schools/staff" component={StaffPage} />
      <Route path="/schools/staff/invite" component={StaffInvitePage} />
      <Route path="/schools/staff/positions" component={StaffPositionsPage} />
      <Route path="/schools/students" component={StudentsPage} />
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
      <AuthProvider>
        <AIStatusProvider>
          <TooltipProvider>
            <Toaster />
            <Router />
          </TooltipProvider>
        </AIStatusProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
