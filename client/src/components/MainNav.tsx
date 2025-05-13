import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { useAuth } from "../hooks/use-auth";

export function MainNav({
  className,
  ...props
}: React.HTMLAttributes<HTMLElement>) {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [location] = useLocation();
  
  return (
    <nav
      className={cn("flex items-center space-x-4 lg:space-x-6", className)}
      {...props}
    >
      <Link
        to="/"
        className="text-sm font-medium transition-colors hover:text-primary"
      >
        Home
      </Link>
      <Link
        to="/dashboard"
        className="text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
      >
        Dashboard
      </Link>
      <Link
        to="/curriculum"
        className="text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
      >
        Curriculum
      </Link>
      <Link
        to="/lessons"
        className="text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
      >
        Lessons
      </Link>
      <Link
        to="/ai-lesson-generator"
        className="text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
      >
        AI Lesson Generator
      </Link>
      <Link
        to="/knowledge-base"
        className="text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
      >
        Knowledge Base
      </Link>
      <Link
        to="/registration"
        className="text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
      >
        Registration
      </Link>
      <Link
        to="/programs"
        className="text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
      >
        Programs
      </Link>
      
      {isAdmin && (
        <Link
          to="/admin/classes"
          className="text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
        >
          Admin Classes
        </Link>
      )}
    </nav>
  );
}