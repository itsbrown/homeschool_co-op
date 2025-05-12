import { Switch, Route } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

import Home from "@/pages/Home";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import Dashboard from "@/pages/Dashboard";
import Curriculum from "@/pages/Curriculum";
import CurriculumDetail from "@/pages/CurriculumDetail";
import Lessons from "@/pages/Lessons";
import AILessonGenerator from "@/pages/AILessonGenerator";
import KnowledgeBase from "@/pages/KnowledgeBase";
import KnowledgeBaseDetail from "@/pages/KnowledgeBaseDetail";
import KnowledgeBaseEdit from "@/pages/KnowledgeBaseEdit";
import Checkout from "@/pages/Checkout";
import CheckoutSuccess from "@/pages/CheckoutSuccess";
import { RegistrationPage } from "@/pages/RegistrationPage";
import { ProgramsPage } from "@/pages/ProgramsPage";
import { AdminClassesPage } from "./pages/AdminClassesPage";
import ChildRegistrationPage from "./pages/ChildRegistrationPage";
import ChildRegistrationConfirmation from "./pages/ChildRegistrationConfirmation";
import ChildRegistrationSuccess from "./pages/ChildRegistrationSuccess";
import ChildrenPage from "./pages/ChildrenPage";
import ChildProfileEditPage from "./pages/ChildProfileEditPage";
import ClassesUploadPage from "./pages/admin/ClassesUploadPage";
import CalendarPage from "./pages/CalendarPage";
import NotFound from "@/pages/not-found";
import { AuthProvider } from "@/hooks/useAuth";
import AIStatusProvider from "@/contexts/AIStatusContext";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/login" component={Login} />
      <Route path="/register" component={Register} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/curriculum" component={Curriculum} />
      <Route path="/curriculum/:id" component={CurriculumDetail} />
      <Route path="/lessons" component={Lessons} />
      <Route path="/lessons/ai-generator" component={AILessonGenerator} />
      <Route path="/knowledge-base" component={KnowledgeBase} />
      <Route path="/knowledge-base/:id/edit" component={KnowledgeBaseEdit} />
      <Route path="/knowledge-base/:id" component={KnowledgeBaseDetail} />
      <Route path="/checkout" component={Checkout} />
      <Route path="/checkout-success" component={CheckoutSuccess} />
      
      {/* Registration system routes */}
      <Route path="/registration" component={RegistrationPage} />
      <Route path="/programs" component={ProgramsPage} />
      <Route path="/children" component={ChildrenPage} />
      <Route path="/children/register" component={ChildRegistrationPage} />
      <Route path="/children/register/confirm" component={ChildRegistrationConfirmation} />
      <Route path="/children/register/success" component={ChildRegistrationSuccess} />
      <Route path="/children/:id/edit" component={ChildProfileEditPage} />
      <Route path="/calendar" component={CalendarPage} />
      
      {/* Admin routes */}
      <Route path="/admin/classes/:rest*" component={AdminClassesPage} />
      
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
