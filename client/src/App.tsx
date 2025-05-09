import { Switch, Route } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

import Home from "@/pages/Home";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import Dashboard from "@/pages/Dashboard";
import Lessons from "@/pages/Lessons";
import AILessonGenerator from "@/pages/AILessonGenerator";
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
      <Route path="/lessons" component={Lessons} />
      <Route path="/lessons/ai-generator" component={AILessonGenerator} />
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
