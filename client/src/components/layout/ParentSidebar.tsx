import React from "react";
import { Link, useLocation } from 'wouter';
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
  DollarSign,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useAuth } from "@/components/SupabaseProvider";
import { useRole } from "@/contexts/RoleContext";
import { useQuery } from "@tanstack/react-query";

interface SidebarNavProps extends React.HTMLAttributes<HTMLElement> {
  items: {
    href: string;
    title: string;
    icon: React.ReactNode;
    badge?: string;
    isSectionHeader?: boolean;
    subItems?: {
      href: string;
      title: string;
      icon: React.ReactNode;
    }[];
  }[];
  expandedSections: { [key: string]: boolean };
  onToggleExpanded: (section: string) => void;
}

export function SidebarNav({ className, items, expandedSections, onToggleExpanded, ...props }: SidebarNavProps) {
  const [location] = useLocation();

  return (
    <nav
      className={cn(
        "flex space-x-2 lg:flex-col lg:space-x-0 lg:space-y-1",
        className,
      )}
      {...props}
    >
      {items.map((item) => {
        if (item.isSectionHeader) {
          return (
            <div key={item.title}>
              <button
                onClick={() => onToggleExpanded(item.title)}
                className={cn(
                  "group flex w-full items-center rounded-md px-3 py-2.5 font-medium hover:bg-accent hover:text-accent-foreground",
                  expandedSections[item.title]
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground",
                  "justify-between"
                )}
              >
                <div className="flex items-center">
                  <div className="mr-2 h-5 w-5">{item.icon}</div>
                  <span>{item.title}</span>
                </div>
                <span>{expandedSections[item.title] ? "-" : "+"}</span>
              </button>
              {expandedSections[item.title] && item.subItems && (
                <div className="space-y-1 pl-4">
                  {item.subItems.map((subItem) => (
                    <Link
                      key={subItem.href}
                      href={subItem.href}
                      className={cn(
                        "group flex items-center rounded-md px-3 py-2.5 font-medium hover:bg-accent hover:text-accent-foreground",
                        location === subItem.href
                          ? "bg-accent text-accent-foreground"
                          : "text-muted-foreground",
                      )}
                    >
                      <div className="flex items-center">
                        <div className="mr-2 h-5 w-5">{subItem.icon}</div>
                        <span>{subItem.title}</span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          );
        } else {
          return (
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
                <div className="mr-2 h-5 w-5">{item.icon}</div>
                <span>{item.title}</span>
              </div>
              {item.badge && (
                <span className="ml-auto flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                  {item.badge}
                </span>
              )}
            </Link>
          );
        }
      })}
    </nav>
  );
}

export default function ParentSidebar() {
  const { user, signOut } = useAuth();
  const { activeRole } = useRole();
  const [isOpen, setIsOpen] = React.useState(false);
  const [location, setLocation] = useLocation();
  const [expandedSections, setExpandedSections] = React.useState<{ [key: string]: boolean }>({});

  // Fetch user's associated school for branding
  const { data: schoolData } = useQuery({
    queryKey: ['/api/school-parents/school', user?.email],
    enabled: !!user?.email,
    staleTime: 300000, // Cache for 5 minutes
  });

  const toggleExpanded = (section: string) => {
    setExpandedSections(prevState => ({
      ...prevState,
      [section]: !prevState[section]
    }));
  };

  const handleLogout = async () => {
    console.log("🚪 ParentSidebar logout clicked");
    await signOut();
  };

  const navigationItems = [
    {
      href: "/dashboard",
      title: "Dashboard",
      icon: <Home className="h-5 w-5" />,
    },
    {
      href: "/children",
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
      href: "/billing",
      title: "Payments",
      icon: <DollarSign className="h-5 w-5" />,
      description: "Manage billing and view payment history"
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
                  {schoolData?.success && schoolData?.school?.logo ? (
                    <div className="flex items-center gap-2">
                      <img 
                        src={schoolData.school.logo} 
                        alt={`${schoolData.school.name} Logo`}
                        className="h-6 w-6 object-contain"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                      <span className="text-lg">{schoolData.school.name}</span>
                    </div>
                  ) : schoolData?.success && schoolData?.school?.name ? (
                    <span className="text-xl">{schoolData.school.name}</span>
                  ) : (
                    <span className="text-xl">LearnSphere</span>
                  )}
                </a>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setIsOpen(false)}
                >
                  <X className="h-5 w-5" />
                </Button>
              </div>

              <SidebarNav 
                items={navigationItems} 
                expandedSections={expandedSections}
                onToggleExpanded={toggleExpanded}
              />
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
                      {activeRole === 'parent' ? 'Parent Account' : 'School Administrator'}
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
              {schoolData?.success && schoolData?.school?.logo ? (
                <div className="flex items-center gap-2">
                  <img 
                    src={schoolData.school.logo} 
                    alt={`${schoolData.school.name} Logo`}
                    className="h-8 w-8 object-contain"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                  <span className="text-xl">{schoolData.school.name}</span>
                </div>
              ) : schoolData?.success && schoolData?.school?.name ? (
                <span className="text-xl">{schoolData.school.name}</span>
              ) : (
                <span className="text-xl">LearnSphere</span>
              )}
            </a>
          </div>

          <ScrollArea className="flex-1 py-4">
            <SidebarNav 
                items={navigationItems} 
                expandedSections={expandedSections}
                onToggleExpanded={toggleExpanded}
              />
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
                    {activeRole === 'parent' ? 'Parent Account' : 'School Administrator'}
                  </p>
                </div>
              </div>
            </div>

            <Button variant="outline" className="w-full" onClick={handleLogout}>
              <LogOut className="mr-2 h-4 w-4" />
              SIGN OUT
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}