import React, { useState, useEffect, useSyncExternalStore } from "react";
import { useAuth } from "@/components/SupabaseProvider";
import { useRole, silentRoleContextUpdate } from "@/contexts/RoleContext";
import { CartProvider } from "@/contexts/CartContext";
import { LayoutShellProvider } from "@/contexts/LayoutShellContext";
import ParentSidebar from "./ParentSidebar";
import CartDrawer from "@/components/cart/CartDrawer";
import CartButton from "@/components/cart/CartButton";
import RoleSwitcher from "@/components/RoleSwitcher.tsx";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetTrigger, SheetClose } from "@/components/ui/sheet";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { LogOut, Menu, User, Bell, Home, Users, BookOpen, Calendar, DollarSign, Settings, FolderOpen, Sparkles, GraduationCap, Clock, ClipboardList, Building2, Shield, ChevronDown, LayoutGrid, CalendarDays, ClipboardCheck, UserCheck, AlertTriangle, RefreshCw, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  apiRequest,
  queryClient,
  getServiceUnavailable,
  subscribeServiceUnavailable,
  setServiceUnavailable,
} from "@/lib/queryClient";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ScrollArea } from "@/components/ui/scroll-area";
import { normalizeNotificationsResponse } from "@/hooks/useNotifications";

interface ParentAppShellProps {
  children: React.ReactNode;
}

const mobileNavigationItems = [
  { href: "/dashboard", title: "ASA Assistant", icon: Sparkles },
  { href: "/parent/home", title: "Dashboard", icon: Home },
  { href: "/notifications", title: "Notifications", icon: Bell },
  { href: "/children", title: "My Children", icon: Users },
  { href: "/parent/emergency-contacts", title: "Emergency Contacts", icon: AlertTriangle },
  { href: "/programs", title: "Programs & Classes", icon: BookOpen },
  { href: "/schedule", title: "Family Schedule", icon: Calendar },
  { href: "/payments", title: "Payments", icon: DollarSign },
  { href: "/parent/documents", title: "My Documents", icon: FolderOpen },
  { href: "/settings", title: "Settings", icon: Settings },
];

const educatorMobileItems = [
  { href: "/educator/dashboard", title: "Educator Dashboard", icon: GraduationCap },
  { href: "/educator/my-classes", title: "My Classes", icon: BookOpen },
  { href: "/educator/students", title: "My Students", icon: Users },
  { href: "/educator/weekly-calendar", title: "Schedule", icon: Calendar },
  { href: "/educator/attendance", title: "Attendance", icon: ClipboardList },
  { href: "/educator/my-hours", title: "My Hours", icon: Clock },
];

const schoolAdminMobileItems = [
  { href: "/school-admin", title: "Admin Dashboard", icon: Building2 },
  { href: "/school-admin/attendance", title: "Attendance", icon: ClipboardList },
  { href: "/school-admin/assessments", title: "Assessments", icon: BookOpen },
];

const academicsMobileItems = [
  { href: "/schools/schedule-builder", title: "Weekly Templates", icon: LayoutGrid },
  { href: "/schools/week-planner", title: "Week Planner", icon: CalendarDays },
  { href: "/school-admin/assessments", title: "Assessments", icon: ClipboardCheck },
  { href: "/school-admin/attendance", title: "Attendance", icon: UserCheck },
];

export default function ParentAppShell({ children }: ParentAppShellProps) {
  const { user, signOut, isAuthenticated } = useAuth();
  const { activeRole, availableRoles, hasRole } = useRole();
  const [location] = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userSchool, setUserSchool] = useState<any>(null);

  const hasEducatorRole = hasRole(['educator', 'teacher', 'mentor']);
  const hasSchoolAdminRole = hasRole(['schoolAdmin', 'director']);
  const hasParentRole = hasRole('parent');

  const isMultiRoleUser = hasParentRole && (hasEducatorRole || hasSchoolAdminRole || availableRoles.length > 1);

  const isEducatorRoute = location.startsWith('/educator/') || location === '/educator';
  const isSchoolAdminRoute = location.startsWith('/school-admin/') || location === '/school-admin';
  const isAcademicsRoute =
    location.startsWith('/schools/') ||
    location === '/schools' ||
    location === '/school-admin/assessments' ||
    location.startsWith('/school-admin/assessments/') ||
    location === '/school-admin/attendance' ||
    location.startsWith('/school-admin/attendance/');

  const [educatorSectionOpen, setEducatorSectionOpen] = useState(isEducatorRoute);
  const [adminSectionOpen, setAdminSectionOpen] = useState(isSchoolAdminRoute);
  const [academicsSectionOpen, setAcademicsSectionOpen] = useState(isAcademicsRoute);

  useEffect(() => {
    if (isEducatorRoute) setEducatorSectionOpen(true);
    if (isSchoolAdminRoute) setAdminSectionOpen(true);
    if (isAcademicsRoute) setAcademicsSectionOpen(true);
  }, [isEducatorRoute, isSchoolAdminRoute, isAcademicsRoute]);

  const { data: permissionsData } = useQuery<{ userLocations: Array<{ permissions: { canManageClasses?: boolean } }> }>({
    queryKey: ['/api/school-admin/user-locations/my-permissions'],
    enabled: !!user,
  });
  const canManageClasses = permissionsData?.userLocations?.[0]?.permissions?.canManageClasses ?? false;

  useEffect(() => {
    if (isEducatorRoute) {
      const educatorRole = availableRoles.find(r =>
        ['educator', 'teacher', 'mentor'].includes(r.role.toLowerCase())
      );
      silentRoleContextUpdate(educatorRole ? educatorRole.role : 'educator');
    } else if (isSchoolAdminRoute) {
      const adminRole = availableRoles.find(r =>
        ['schooladmin', 'director'].includes(r.role.toLowerCase())
      );
      silentRoleContextUpdate(adminRole ? adminRole.role : 'schoolAdmin');
    } else if (
      location.startsWith('/parent/') ||
      ['/dashboard', '/children', '/payments', '/schedule', '/notifications', '/settings'].some(
        p => location === p || location.startsWith(p + '/')
      )
    ) {
      silentRoleContextUpdate('parent');
    }
  }, [location, availableRoles]);

  const { data: notifications = [] } = useQuery({
    queryKey: ['/api/notifications'],
    enabled: !!user?.id,
    select: normalizeNotificationsResponse,
  });

  const unreadNotifications = notifications.filter(n => !n.read).length;

  // Task 266 — subscribe to the global SERVICE_UNAVAILABLE signal so we can
  // render a single non-blocking banner above the page content.
  const isServiceUnavailable = useSyncExternalStore(
    subscribeServiceUnavailable,
    getServiceUnavailable,
    getServiceUnavailable,
  );
  const [bannerDismissed, setBannerDismissed] = useState(false);
  useEffect(() => {
    // Re-arm the banner whenever the flag flips back on after being cleared.
    if (isServiceUnavailable) setBannerDismissed(false);
  }, [isServiceUnavailable]);
  const showServiceBanner = isServiceUnavailable && !bannerDismissed;
  const handleServiceRetry = () => {
    setServiceUnavailable(false);
    setBannerDismissed(false);
    queryClient.invalidateQueries();
  };

  const handleLogout = async () => {
    console.log('🚪 ParentAppShell logout clicked');
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
          setUserSchool({ name: "Learning Platform", logo: null });
        } catch (error) {
          setUserSchool({ name: "Learning Platform", logo: null });
        }
      };
      fetchUserSchool();
    }
  }, [user?.email]);

  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isAuthenticated) {
      setLocation('/login');
    }
  }, [isAuthenticated, setLocation]);

  return (
    <LayoutShellProvider>
    <CartProvider>
      <div className="min-h-screen bg-gray-50">
        {/* Desktop sidebar */}
        <div className="hidden lg:fixed lg:inset-y-0 lg:flex lg:w-64 lg:flex-col">
          <ParentSidebar />
        </div>

        <div className="lg:pl-64">
          {/* Mobile header */}
          <div className="lg:hidden">
            <div className="flex items-center justify-between bg-white px-4 py-4 shadow-sm border-b">
              <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
                <SheetTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-10 w-10"
                    data-testid="button-mobile-menu"
                  >
                    <Menu className="h-6 w-6" />
                  </Button>
                </SheetTrigger>

                <SheetContent side="left" className="w-[300px] p-0">
                  <div className="flex h-full flex-col">
                    <div className="flex items-center gap-3 border-b p-4">
                      {userSchool?.logo && (
                        <img
                          src={userSchool.logo}
                          alt={`${userSchool.name} Logo`}
                          className="h-10 w-10 object-contain"
                          onError={(e) => { e.currentTarget.style.display = 'none'; }}
                        />
                      )}
                      <h2 className="text-lg font-semibold">{userSchool?.name || 'American Seekers Academy'}</h2>
                    </div>

                    <ScrollArea className="flex-1 px-3 py-4">
                      <nav className="space-y-1">
                        {mobileNavigationItems.map((item) => {
                          const Icon = item.icon;
                          const isActive = location === item.href;
                          const showBadge = item.href === "/notifications" && unreadNotifications > 0;
                          return (
                            <SheetClose asChild key={item.href}>
                              <Link
                                href={item.href}
                                className={cn(
                                  "flex items-center gap-3 rounded-lg px-3 py-3 text-base font-medium transition-colors",
                                  isActive
                                    ? "bg-primary text-primary-foreground"
                                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                                )}
                                data-testid={`nav-${item.href.replace('/', '')}`}
                              >
                                <Icon className="h-5 w-5" />
                                <span className="flex-1">{item.title}</span>
                                {showBadge && (
                                  <Badge variant="destructive" className="h-5 min-w-5 rounded-full px-1.5 text-[10px]">
                                    {unreadNotifications > 9 ? '9+' : unreadNotifications}
                                  </Badge>
                                )}
                              </Link>
                            </SheetClose>
                          );
                        })}

                        {hasEducatorRole && (
                          <Collapsible open={educatorSectionOpen} onOpenChange={setEducatorSectionOpen}>
                            <CollapsibleTrigger className={cn(
                              "flex w-full items-center justify-between rounded-lg px-3 py-3 text-base font-medium transition-colors",
                              educatorSectionOpen
                                ? "bg-accent text-accent-foreground"
                                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                            )}>
                              <div className="flex items-center gap-3">
                                <GraduationCap className="h-5 w-5" />
                                <span>Educator</span>
                              </div>
                              <ChevronDown className={cn(
                                "h-4 w-4 transition-transform duration-200",
                                educatorSectionOpen && "rotate-180"
                              )} />
                            </CollapsibleTrigger>
                            <CollapsibleContent className="mt-1 space-y-1 pl-4">
                              {educatorMobileItems.map((item) => {
                                const Icon = item.icon;
                                const isActive = location === item.href || location.startsWith(item.href + '/');
                                return (
                                  <SheetClose asChild key={item.href}>
                                    <Link
                                      href={item.href}
                                      className={cn(
                                        "flex items-center gap-3 rounded-lg px-3 py-2.5 text-base font-medium transition-colors",
                                        isActive
                                          ? "bg-accent text-accent-foreground"
                                          : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                                      )}
                                    >
                                      <Icon className="h-5 w-5" />
                                      <span className="flex-1">{item.title}</span>
                                    </Link>
                                  </SheetClose>
                                );
                              })}
                            </CollapsibleContent>
                          </Collapsible>
                        )}

                        {hasSchoolAdminRole && (
                          <Collapsible open={adminSectionOpen} onOpenChange={setAdminSectionOpen}>
                            <CollapsibleTrigger className={cn(
                              "flex w-full items-center justify-between rounded-lg px-3 py-3 text-base font-medium transition-colors",
                              adminSectionOpen
                                ? "bg-accent text-accent-foreground"
                                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                            )}>
                              <div className="flex items-center gap-3">
                                <Building2 className="h-5 w-5" />
                                <span>School Admin</span>
                              </div>
                              <ChevronDown className={cn(
                                "h-4 w-4 transition-transform duration-200",
                                adminSectionOpen && "rotate-180"
                              )} />
                            </CollapsibleTrigger>
                            <CollapsibleContent className="mt-1 space-y-1 pl-4">
                              {schoolAdminMobileItems.map((item) => {
                                const Icon = item.icon;
                                const isActive = location === item.href || location.startsWith(item.href + '/');
                                return (
                                  <SheetClose asChild key={item.href}>
                                    <Link
                                      href={item.href}
                                      className={cn(
                                        "flex items-center gap-3 rounded-lg px-3 py-2.5 text-base font-medium transition-colors",
                                        isActive
                                          ? "bg-accent text-accent-foreground"
                                          : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                                      )}
                                    >
                                      <Icon className="h-5 w-5" />
                                      <span className="flex-1">{item.title}</span>
                                    </Link>
                                  </SheetClose>
                                );
                              })}
                            </CollapsibleContent>
                          </Collapsible>
                        )}

                        {canManageClasses && (
                          <Collapsible open={academicsSectionOpen} onOpenChange={setAcademicsSectionOpen}>
                            <CollapsibleTrigger className={cn(
                              "flex w-full items-center justify-between rounded-lg px-3 py-3 text-base font-medium transition-colors",
                              academicsSectionOpen
                                ? "bg-accent text-accent-foreground"
                                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                            )}>
                              <div className="flex items-center gap-3">
                                <LayoutGrid className="h-5 w-5" />
                                <span>Academics</span>
                              </div>
                              <ChevronDown className={cn(
                                "h-4 w-4 transition-transform duration-200",
                                academicsSectionOpen && "rotate-180"
                              )} />
                            </CollapsibleTrigger>
                            <CollapsibleContent className="mt-1 space-y-1 pl-4">
                              {academicsMobileItems.map((item) => {
                                const Icon = item.icon;
                                const isActive = location === item.href || location.startsWith(item.href + '/');
                                return (
                                  <SheetClose asChild key={item.href}>
                                    <Link
                                      href={item.href}
                                      className={cn(
                                        "flex items-center gap-3 rounded-lg px-3 py-2.5 text-base font-medium transition-colors",
                                        isActive
                                          ? "bg-accent text-accent-foreground"
                                          : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                                      )}
                                    >
                                      <Icon className="h-5 w-5" />
                                      <span className="flex-1">{item.title}</span>
                                    </Link>
                                  </SheetClose>
                                );
                              })}
                            </CollapsibleContent>
                          </Collapsible>
                        )}

                        {hasRole('superadmin') && (
                          <SheetClose asChild>
                            <Link
                              href="/superadmin/schools"
                              className={cn(
                                "flex items-center gap-3 rounded-lg px-3 py-3 text-base font-medium transition-colors",
                                location === "/superadmin/schools"
                                  ? "bg-primary text-primary-foreground"
                                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                              )}
                            >
                              <Shield className="h-5 w-5" />
                              <span className="flex-1">Super Admin</span>
                            </Link>
                          </SheetClose>
                        )}
                      </nav>
                    </ScrollArea>

                    <div className="border-t p-4">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                          <User className="h-5 w-5 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{user?.email}</p>
                          <p className="text-xs text-muted-foreground">Parent Account</p>
                        </div>
                      </div>

                      {!isMultiRoleUser && (
                        <div className="mb-3">
                          <RoleSwitcher />
                        </div>
                      )}

                      <Button
                        variant="outline"
                        className="w-full"
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
                {userSchool?.logo ? (
                  <img
                    src={userSchool.logo}
                    alt={`${userSchool.name} Logo`}
                    className="h-32 w-auto max-w-[280px] object-contain"
                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                  />
                ) : (
                  <h1 className="text-lg font-semibold">{userSchool?.name || 'American Seekers Academy'}</h1>
                )}
              </div>

              <div className="flex items-center gap-2">
                <Link href="/notifications">
                  <Button variant="ghost" size="icon" className="relative h-10 w-10" data-testid="button-notifications-mobile">
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
                <CartButton key="cart-button" />
              </div>
            </div>
          </div>

          {/* Desktop header */}
          <div className="hidden lg:block">
            <div className="flex items-center justify-end bg-white px-6 py-3 shadow-sm border-b">
              <div className="flex items-center gap-4">
                {!isMultiRoleUser && <RoleSwitcher />}

                <Link href="/notifications">
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
                <CartButton key="cart-button" />
                {isAuthenticated && user && (
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <div className="text-sm font-medium">{user.user_metadata?.full_name || user.email}</div>
                      <div className="text-xs text-muted-foreground">
                        {activeRole === 'parent' ? 'Parent Account' : 'User'}
                      </div>
                    </div>
                    <div className="rounded-full bg-primary/10 p-2">
                      <User className="h-4 w-4 text-primary" />
                    </div>
                    <Button variant="ghost" size="sm" onClick={handleLogout}>
                      <LogOut className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {showServiceBanner && (
            <div
              className="border-b border-amber-200 bg-amber-50 px-4 py-3 lg:px-6"
              role="status"
              data-testid="banner-service-unavailable"
            >
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 flex-shrink-0 text-amber-600 mt-0.5" />
                <div className="flex-1 text-sm text-amber-800">
                  Service temporarily unavailable — some data may not load. We'll keep trying.
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 border-amber-300 bg-white text-amber-800 hover:bg-amber-100"
                    onClick={handleServiceRetry}
                    data-testid="button-service-unavailable-retry"
                  >
                    <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                    Retry
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-amber-800 hover:bg-amber-100"
                    onClick={() => setBannerDismissed(true)}
                    data-testid="button-service-unavailable-dismiss"
                    aria-label="Dismiss"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          )}

          <main className="flex-1">
            {children}
          </main>
        </div>

        <CartDrawer />
      </div>
    </CartProvider>
    </LayoutShellProvider>
  );
}
