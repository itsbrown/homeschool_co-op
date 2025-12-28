import { useState, useEffect } from "react";
import { useAuth } from "@/components/SupabaseProvider";
import { useRole } from "@/contexts/RoleContext";
import RoleSwitcher from "@/components/RoleSwitcher.tsx";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetTrigger, SheetClose } from "@/components/ui/sheet";
import { LogOut, Menu, User, Bell, Home, BookOpen, Calendar, Clock, Users, Settings, GraduationCap, PlayCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ScrollArea } from "@/components/ui/scroll-area";

interface EducatorAppShellProps {
  children: React.ReactNode;
}

interface Notification {
  id: number;
  recipientStatus?: string;
}

const educatorNavigationItems = [
  {
    href: "/educator/dashboard",
    title: "Dashboard",
    icon: Home,
  },
  {
    href: "/educator/my-classes",
    title: "My Classes",
    icon: BookOpen,
  },
  {
    href: "/educator/students",
    title: "My Students",
    icon: Users,
  },
  {
    href: "/educator/weekly-calendar",
    title: "Schedule",
    icon: Calendar,
  },
  {
    href: "/educator/my-hours",
    title: "My Hours",
    icon: Clock,
  },
  {
    href: "/educator/notifications",
    title: "Notifications",
    icon: Bell,
  },
  {
    href: "/educator/settings",
    title: "Settings",
    icon: Settings,
  },
];

function EducatorSidebar() {
  const [location] = useLocation();
  const { user, signOut } = useAuth();
  const { activeRole } = useRole();
  const [userSchool, setUserSchool] = useState<any>(null);

  const { data: notifications = [] } = useQuery<Notification[]>({
    queryKey: ['/api/notifications'],
    enabled: !!user?.id,
  });

  const unreadNotifications = notifications.filter(n => n.recipientStatus !== "read").length;

  useEffect(() => {
    if (user?.email) {
      const fetchUserSchool = async () => {
        try {
          const response = await apiRequest("GET", `/api/school-parents/school/${user.email}`);
          if (response.ok) {
            const result = await response.json();
            if (result.success && result.school) {
              setUserSchool(result.school);
              return;
            }
          }
          setUserSchool({ name: "Learning Platform", logo: null });
        } catch (error) {
          setUserSchool({ name: "Learning Platform", logo: null });
        }
      };
      fetchUserSchool();
    }
  }, [user?.email]);

  const handleLogout = async () => {
    await signOut();
  };

  const getRoleLabel = (role: string) => {
    const labels: Record<string, string> = {
      mentor: 'Mentor',
      educator: 'Educator',
      teacher: 'Teacher',
    };
    return labels[role.toLowerCase()] || 'Educator';
  };

  return (
    <div className="flex h-full flex-col bg-slate-900 text-white">
      <div className="flex h-16 items-center justify-center border-b border-slate-700 px-4">
        {userSchool?.logo ? (
          <img
            src={userSchool.logo}
            alt={`${userSchool.name} Logo`}
            className="h-10 w-auto max-w-[180px] object-contain"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
        ) : (
          <div className="flex items-center gap-2">
            <GraduationCap className="h-6 w-6 text-emerald-400" />
            <h1 className="text-lg font-semibold">{userSchool?.name || 'Educator Portal'}</h1>
          </div>
        )}
      </div>

      <ScrollArea className="flex-1 px-3 py-4">
        <nav className="space-y-1">
          {educatorNavigationItems.map((item) => {
            const Icon = item.icon;
            const isActive = location === item.href || location.startsWith(item.href + '/');
            const showBadge = item.href === "/educator/notifications" && unreadNotifications > 0;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-emerald-600 text-white"
                    : "text-slate-300 hover:bg-slate-800 hover:text-white"
                )}
                data-testid={`nav-educator-${item.href.split('/').pop()}`}
              >
                <Icon className="h-5 w-5" />
                <span className="flex-1">{item.title}</span>
                {showBadge && (
                  <Badge 
                    variant="destructive" 
                    className="h-5 min-w-5 rounded-full px-1.5 text-[10px]"
                  >
                    {unreadNotifications > 9 ? '9+' : unreadNotifications}
                  </Badge>
                )}
              </Link>
            );
          })}
        </nav>
      </ScrollArea>

      <div className="border-t border-slate-700 p-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="h-10 w-10 rounded-full bg-emerald-600 flex items-center justify-center">
            <User className="h-5 w-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate text-white">{user?.user_metadata?.full_name || user?.email}</p>
            <p className="text-xs text-slate-400">{getRoleLabel(activeRole)}</p>
          </div>
        </div>

        <RoleSwitcher />

        <Button
          variant="ghost"
          className="w-full mt-3 text-slate-300 hover:text-white hover:bg-slate-800"
          onClick={handleLogout}
          data-testid="button-logout-sidebar"
        >
          <LogOut className="mr-2 h-4 w-4" />
          Log Out
        </Button>
      </div>
    </div>
  );
}

export default function EducatorAppShell({ children }: EducatorAppShellProps) {
  const { user, signOut, isAuthenticated } = useAuth();
  const { activeRole } = useRole();
  const [location, setLocation] = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userSchool, setUserSchool] = useState<any>(null);

  const { data: notifications = [] } = useQuery<Notification[]>({
    queryKey: ['/api/notifications'],
    enabled: !!user?.id,
  });

  const unreadNotifications = notifications.filter(n => n.recipientStatus !== "read").length;

  const handleLogout = async () => {
    await signOut();
  };

  useEffect(() => {
    if (user?.email) {
      const fetchUserSchool = async () => {
        try {
          const response = await apiRequest("GET", `/api/school-parents/school/${user.email}`);
          if (response.ok) {
            const result = await response.json();
            if (result.success && result.school) {
              setUserSchool(result.school);
              return;
            }
          }
          setUserSchool({ name: "Educator Portal", logo: null });
        } catch (error) {
          setUserSchool({ name: "Educator Portal", logo: null });
        }
      };
      fetchUserSchool();
    }
  }, [user?.email]);

  useEffect(() => {
    if (!isAuthenticated) {
      setLocation('/login');
    }
  }, [isAuthenticated, setLocation]);

  const getRoleLabel = (role: string) => {
    const labels: Record<string, string> = {
      mentor: 'Mentor',
      educator: 'Educator',
      teacher: 'Teacher',
    };
    return labels[role.toLowerCase()] || 'Educator';
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="hidden lg:fixed lg:inset-y-0 lg:flex lg:w-64 lg:flex-col">
        <EducatorSidebar />
      </div>

      <div className="lg:pl-64">
        <div className="lg:hidden">
          <div className="flex items-center justify-between bg-slate-900 px-4 py-4 shadow-sm">
            <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-10 w-10 text-white hover:bg-slate-800"
                  data-testid="button-mobile-menu"
                >
                  <Menu className="h-6 w-6" />
                </Button>
              </SheetTrigger>

              <SheetContent side="left" className="w-[300px] p-0 bg-slate-900 border-slate-700">
                <div className="flex h-full flex-col">
                  <div className="flex items-center gap-3 border-b border-slate-700 p-4">
                    <GraduationCap className="h-8 w-8 text-emerald-400" />
                    <h2 className="text-lg font-semibold text-white">{userSchool?.name || 'Educator Portal'}</h2>
                  </div>

                  <ScrollArea className="flex-1 px-3 py-4">
                    <nav className="space-y-1">
                      {educatorNavigationItems.map((item) => {
                        const Icon = item.icon;
                        const isActive = location === item.href || location.startsWith(item.href + '/');
                        const showBadge = item.href === "/educator/notifications" && unreadNotifications > 0;

                        return (
                          <SheetClose asChild key={item.href}>
                            <Link
                              href={item.href}
                              className={cn(
                                "flex items-center gap-3 rounded-lg px-3 py-3 text-base font-medium transition-colors",
                                isActive
                                  ? "bg-emerald-600 text-white"
                                  : "text-slate-300 hover:bg-slate-800 hover:text-white"
                              )}
                              data-testid={`nav-mobile-${item.href.split('/').pop()}`}
                            >
                              <Icon className="h-5 w-5" />
                              <span className="flex-1">{item.title}</span>
                              {showBadge && (
                                <Badge 
                                  variant="destructive" 
                                  className="h-5 min-w-5 rounded-full px-1.5 text-[10px]"
                                >
                                  {unreadNotifications > 9 ? '9+' : unreadNotifications}
                                </Badge>
                              )}
                            </Link>
                          </SheetClose>
                        );
                      })}
                    </nav>
                  </ScrollArea>

                  <div className="border-t border-slate-700 p-4">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="h-10 w-10 rounded-full bg-emerald-600 flex items-center justify-center">
                        <User className="h-5 w-5 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate text-white">{user?.email}</p>
                        <p className="text-xs text-slate-400">{getRoleLabel(activeRole)}</p>
                      </div>
                    </div>

                    <div className="mb-3">
                      <RoleSwitcher />
                    </div>

                    <Button
                      variant="outline"
                      className="w-full border-slate-600 text-slate-300 hover:bg-slate-800 hover:text-white"
                      onClick={handleLogout}
                      data-testid="button-logout-mobile"
                    >
                      <LogOut className="mr-2 h-4 w-4" />
                      Log Out
                    </Button>
                  </div>
                </div>
              </SheetContent>
            </Sheet>

            <div className="flex-1 flex items-center justify-center px-2">
              <div className="flex items-center gap-2">
                <GraduationCap className="h-6 w-6 text-emerald-400" />
                <h1 className="text-lg font-semibold text-white">{userSchool?.name || 'Educator'}</h1>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Link href="/educator/notifications">
                <Button variant="ghost" size="icon" className="relative h-10 w-10 text-white hover:bg-slate-800" data-testid="button-notifications-mobile">
                  <Bell className="h-5 w-5" />
                  {unreadNotifications > 0 && (
                    <Badge 
                      variant="destructive" 
                      className="absolute -top-1 -right-1 h-5 w-5 rounded-full p-0 flex items-center justify-center text-[10px]"
                      data-testid="badge-notification-count-mobile"
                    >
                      {unreadNotifications > 9 ? '9+' : unreadNotifications}
                    </Badge>
                  )}
                </Button>
              </Link>
            </div>
          </div>
        </div>

        <div className="hidden lg:block">
          <div className="flex items-center justify-end bg-white px-6 py-3 shadow-sm border-b">
            <div className="flex items-center gap-4">
              <RoleSwitcher />

              <Link href="/educator/notifications">
                <Button variant="ghost" size="icon" className="relative" data-testid="button-notifications-desktop">
                  <Bell className="h-5 w-5" />
                  {unreadNotifications > 0 && (
                    <Badge 
                      variant="destructive" 
                      className="absolute -top-1 -right-1 h-5 w-5 rounded-full p-0 flex items-center justify-center text-xs"
                      data-testid="badge-notification-count-desktop"
                    >
                      {unreadNotifications > 9 ? '9+' : unreadNotifications}
                    </Badge>
                  )}
                </Button>
              </Link>

              {isAuthenticated && user && (
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <div className="text-sm font-medium">{user.user_metadata?.full_name || user.email}</div>
                    <div className="text-xs text-muted-foreground">
                      {getRoleLabel(activeRole)}
                    </div>
                  </div>
                  <div className="rounded-full bg-emerald-100 p-2">
                    <GraduationCap className="h-4 w-4 text-emerald-600" />
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleLogout}
                    data-testid="button-logout-desktop"
                  >
                    <LogOut className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>

        <main className="flex-1">
          {children}
        </main>
      </div>
    </div>
  );
}
