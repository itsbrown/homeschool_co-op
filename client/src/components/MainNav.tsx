import { Link as WouterLink, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth0";
import { Sparkles, Book, Layers, BookOpen, Users, GraduationCap, User2 } from "lucide-react";

// Create a Link component that highlights the active page
function Link({ to, children, className, ...props }: { to: string; children: React.ReactNode, className?: string }) {
  const [location] = useLocation();
  const isActive = location === to || location.startsWith(`${to}/`);
  
  return (
    <WouterLink
      to={to}
      className={cn(
        "text-sm font-medium transition-colors hover:text-primary flex items-center gap-1.5",
        isActive ? "text-primary" : "text-muted-foreground",
        className
      )}
      {...props}
    >
      {children}
    </WouterLink>
  );
}

export function MainNav({
  className,
  ...props
}: React.HTMLAttributes<HTMLElement>) {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const isEducator = user?.role === "educator" || isAdmin;
  
  return (
    <nav
      className={cn("flex items-center space-x-4 lg:space-x-6", className)}
      {...props}
    >
      <Link to="/">
        Home
      </Link>
      <Link to="/dashboard">
        Dashboard
      </Link>
      
      {/* Content Management */}
      <Link to="/curriculum">
        <Layers className="h-4 w-4" />
        Curriculum
      </Link>
      <Link to="/lessons">
        <BookOpen className="h-4 w-4" />
        Lessons
      </Link>
      
      {/* AI & Knowledge Base section - available to educators and admins */}
      {isEducator && (
        <>
          <Link to="/ai-generator/lesson">
            <Sparkles className="h-4 w-4" />
            AI Lesson
          </Link>
          <Link to="/ai-generator/curriculum">
            <Sparkles className="h-4 w-4" />
            AI Curriculum
          </Link>
          <Link to="/knowledge-base">
            <Book className="h-4 w-4" />
            Knowledge Base
          </Link>
        </>
      )}
      
      {/* User Management */}
      <Link to="/registration">
        <User2 className="h-4 w-4" />
        Registration
      </Link>
      <Link to="/programs">
        <GraduationCap className="h-4 w-4" />
        Programs
      </Link>
      
      {/* Admin-only links */}
      {isAdmin && (
        <Link to="/admin/classes">
          <Users className="h-4 w-4" />
          Admin Classes
        </Link>
      )}
    </nav>
  );
}