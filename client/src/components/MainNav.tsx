import { useState } from "react";
import { Link as WouterLink, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth0";
import { Sparkles, Book, Layers, BookOpen, Users, GraduationCap, User2, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetClose } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";

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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const isAdmin = user?.role === "admin";
  const isEducator = user?.role === "educator" || isAdmin;
  
  const navigationItems = [
    { to: "/", label: "Home", icon: null },
    { to: "/dashboard", label: "Dashboard", icon: null },
    { to: "/curriculum", label: "Curriculum", icon: Layers },
    { to: "/lessons", label: "Lessons", icon: BookOpen },
    ...(isEducator ? [
      { to: "/ai-generator/lesson", label: "AI Lesson", icon: Sparkles },
      { to: "/ai-generator/curriculum", label: "AI Curriculum", icon: Sparkles },
      { to: "/knowledge-base", label: "Knowledge Base", icon: Book },
    ] : []),
    { to: "/registration", label: "Registration", icon: User2 },
    { to: "/programs", label: "Programs", icon: GraduationCap },
    ...(isAdmin ? [
      { to: "/admin/classes", label: "Admin Classes", icon: Users },
    ] : []),
  ];
  
  return (
    <>
      {/* Mobile Navigation */}
      <div className="lg:hidden">
        <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="h-10 w-10" data-testid="button-mobile-nav">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-[280px] p-0">
            <SheetHeader className="border-b p-4">
              <SheetTitle>Navigation</SheetTitle>
            </SheetHeader>
            <ScrollArea className="h-full p-4">
              <nav className="space-y-1">
                {navigationItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <SheetClose asChild key={item.to}>
                      <Link
                        to={item.to}
                        className="flex items-center gap-3 rounded-lg px-3 py-3 text-base font-medium transition-colors hover:bg-accent"
                      >
                        {Icon && <Icon className="h-5 w-5" />}
                        <span>{item.label}</span>
                      </Link>
                    </SheetClose>
                  );
                })}
              </nav>
            </ScrollArea>
          </SheetContent>
        </Sheet>
      </div>

      {/* Desktop Navigation */}
      <nav
        className={cn("hidden lg:flex items-center space-x-4 lg:space-x-6", className)}
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
    </>
  );
}