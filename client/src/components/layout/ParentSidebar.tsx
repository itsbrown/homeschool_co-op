import React from "react";
import { useLocation, Link } from "wouter";
import { cn } from "@/lib/utils";
import {
  Home,
  Users,
  BookOpen,
  Calendar,
  CreditCard,
  Bot,
  Settings,
  User,
  LogOut,
  Menu,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useAuth } from "@/components/SupabaseProvider";
import { apiRequest } from "@/lib/queryClient";

interface SidebarNavProps extends React.HTMLAttributes<HTMLElement> {
  items: {
    href: string;
    title: string;
    icon: React.ReactNode;
    badge?: string;
  }[];
}

export function SidebarNav({ className, items, ...props }: SidebarNavProps) {
  const [location] = useLocation();

  return (
    <nav
      className={cn(
        "flex space-x-2 lg:flex-col lg:space-x-0 lg:space-y-1",
        className,
      )}
      {...props}
    >
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={cn(
            "group flex items-center rounded-md px-3 py-2.5 font-medium hover:bg-accent hover:text-accent-foreground",
            location === item.href
              ? "bg-accent text-accent-foreground"
              : "text-muted-foreground",
          )}
        >
          <div className="flex items-center">
            <span className="mr-2 h-5 w-5">{item.icon}</span>
            <span>{item.title}</span>
          </div>
          {item.badge && (
            <span className="ml-auto flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
              {item.badge}
            </span>
          )}
        </Link>
      ))}
    </nav>
  );
}

export default function ParentSidebar() {
  const { user, signOut } = useAuth();
  const [isOpen, setIsOpen] = React.useState(false);

  /*const handleLogout = async () => {
    console.log('🚪 ParentSidebar logout clicked');
    await signOut();
  };*/
  const handleLogout = async () => {
    try {
      await apiRequest("POST", "/auth/logout");
      window.location.href = "/login";
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  // Parent navigation items
  const navigationItems = [
    {
      href: "/dashboard",
      title: "Dashboard",
      icon: <Home className="h-5 w-5" />,
    },
    {
      href: "/children/view",
      title: "My Children",
      icon: <Users className="h-5 w-5" />,
    },
    {
      href: "/programs",
      title: "Programs & Classes",
      icon: <BookOpen className="h-5 w-5" />,
    },
    {
      href: "/schedule",
      title: "Family Schedule",
      icon: <Calendar className="h-5 w-5" />,
    },
    {
      href: "/payments",
      title: "Payments",
      icon: <CreditCard className="h-5 w-5" />,
    },
    {
      href: "/enrollment-assistant",
      title: "AI Enrollment Assistant",
      icon: <Bot className="h-5 w-5" />,
    },
    {
      href: "/settings",
      title: "Settings",
      icon: <Settings className="h-5 w-5" />,
    },
  ];

  return (
    <>
      {/* Mobile sidebar trigger */}
      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <SheetTrigger asChild>
          <Button variant="outline" size="icon" className="lg:hidden">
            <Menu className="h-5 w-5" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="sm:max-w-xs">
          <div className="flex h-full flex-col justify-between">
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <a
                  href="/dashboard"
                  className="flex items-center gap-2 font-semibold"
                >
                  <span className="text-xl">LearnSphere</span>
                </a>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setIsOpen(false)}
                >
                  <X className="h-5 w-5" />
                </Button>
              </div>

              <SidebarNav items={navigationItems} />
            </div>

            <div className="border-t pt-4">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center">
                  <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center mr-3">
                    <User className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium">{user?.email}</p>
                    <p className="text-xs text-muted-foreground">
                      Parent Account
                    </p>
                  </div>
                </div>
              </div>

              <Button
                variant="outline"
                className="w-full"
                onClick={handleLogout}
              >
                <LogOut className="mr-2 h-4 w-4" />
                Log Out
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Desktop sidebar */}
      <div className="hidden border-r bg-background lg:block">
        <div className="flex h-screen flex-col p-4">
          <div className="flex items-center gap-2 px-2 py-4">
            <a
              href="/dashboard"
              className="flex items-center gap-2 font-semibold"
            >
              <span className="text-xl">LearnSphere</span>
            </a>
          </div>

          <ScrollArea className="flex-1 py-4">
            <SidebarNav items={navigationItems} />
          </ScrollArea>

          <div className="border-t pt-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center">
                <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center mr-3">
                  <User className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="font-medium">{user?.email}</p>
                  <p className="text-xs text-muted-foreground">
                    Parent Account
                  </p>
                </div>
              </div>
            </div>

            <Button variant="outline" className="w-full" onClick={handleLogout}>
              <LogOut className="mr-2 h-4 w-4" />
              Log Out
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
