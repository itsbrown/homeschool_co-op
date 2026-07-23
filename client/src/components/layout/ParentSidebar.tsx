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
  Brain,
  Bell,
  FolderOpen,
  Shield,
  ShieldAlert,
  Sparkles,
  GraduationCap,
  Clock,
  ClipboardList,
  Building2,
  ChevronDown,
  LayoutGrid,
  CalendarDays,
  ClipboardCheck,
  UserCheck,
  TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useAuth } from "@/components/SupabaseProvider";
import { useRole } from "@/contexts/RoleContext";
import { useEffectivePermissions } from "@/hooks/useEffectivePermissions";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

const getRoleLabel = (role: string): string => {
  const lowerRole = role?.toLowerCase() || '';
  if (lowerRole === 'parent') return 'Parent Account';
  if (['educator', 'mentor', 'teacher'].includes(lowerRole)) return 'Educator';
  if (['schooladmin', 'director'].includes(lowerRole)) return 'School Administrator';
  if (lowerRole === 'superadmin') return 'Super Admin';
  return role || 'User';
};

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
          const isOpen = !!expandedSections[item.title];
          return (
            <Collapsible
              key={item.title}
              open={isOpen}
              onOpenChange={() => onToggleExpanded(item.title)}
            >
              <CollapsibleTrigger
                className={cn(
                  "group flex w-full items-center rounded-md px-3 py-2.5 font-medium hover:bg-accent hover:text-accent-foreground",
                  isOpen
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground",
                  "justify-between"
                )}
              >
                <div className="flex items-center">
                  <div className="mr-2 h-5 w-5">{item.icon}</div>
                  <span>{item.title}</span>
                </div>
                <ChevronDown
                  className={cn(
                    "h-4 w-4 transition-transform duration-200",
                    isOpen && "rotate-180"
                  )}
                />
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-1 pl-4 mt-1">
                {item.subItems?.map((subItem) => (
                  <Link
                    key={subItem.href}
                    href={subItem.href}
                    className={cn(
                      "group flex items-center rounded-md px-3 py-2.5 font-medium hover:bg-accent hover:text-accent-foreground",
                      location === subItem.href || location.startsWith(subItem.href + '/')
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
              </CollapsibleContent>
            </Collapsible>
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
  const { activeRole, availableRoles, hasRole } = useRole();
  
  const hasSuperAdminRole = hasRole('superadmin');
  const hasEducatorRole = hasRole(['educator', 'teacher', 'mentor']);
  const hasSchoolAdminRole = hasRole(['schoolAdmin', 'director']);
  const [isOpen, setIsOpen] = React.useState(false);
  const [location] = useLocation();

  const isEducatorRoute = location.startsWith('/educator/') || location === '/educator';
  const isSchoolAdminRoute = location.startsWith('/school-admin/') || location === '/school-admin';
  const isAcademicsRoute =
    location.startsWith('/schools/') ||
    location === '/schools' ||
    location === '/school-admin/assessments' ||
    location.startsWith('/school-admin/assessments/') ||
    location === '/school-admin/attendance' ||
    location.startsWith('/school-admin/attendance/');
  const isPaymentsRoute = location === '/payments' || location === '/payment-methods';

  const [expandedSections, setExpandedSections] = React.useState<{ [key: string]: boolean }>(() => ({
    'Educator': isEducatorRoute,
    'School Admin': isSchoolAdminRoute,
    'Academics': isAcademicsRoute,
    'Payments': isPaymentsRoute,
  }));
  const [logoLoadFailed, setLogoLoadFailed] = React.useState(false);
  const [mobileLogoLoadFailed, setMobileLogoLoadFailed] = React.useState(false);

  React.useEffect(() => {
    if (isEducatorRoute) {
      setExpandedSections(prev => ({ ...prev, 'Educator': true }));
    }
    if (isSchoolAdminRoute) {
      setExpandedSections(prev => ({ ...prev, 'School Admin': true }));
    }
    if (isAcademicsRoute) {
      setExpandedSections(prev => ({ ...prev, 'Academics': true }));
    }
    if (isPaymentsRoute) {
      setExpandedSections(prev => ({ ...prev, 'Payments': true }));
    }
  }, [isEducatorRoute, isSchoolAdminRoute, isAcademicsRoute, isPaymentsRoute]);

  const { can } = useEffectivePermissions();
  const canManageClasses = can('canManageClasses');

  const { data: schoolData } = useQuery({
    queryKey: [`/api/school-parents/school/${user?.email}`],
    enabled: !!user?.email,
    staleTime: 300000,
    queryFn: async () => {
      try {
        const response = await apiRequest("GET", `/api/school-parents/school/${user?.email}`);
        if (response.ok) {
          const result = await response.json();
          if (result.success && result.school) {
            return { success: true, school: result.school };
          }
        }
        return {
          success: true,
          school: {
            name: "Learning Platform",
            logo: null
          }
        };
      } catch (error) {
        return {
          success: true,
          school: {
            name: "Learning Platform",
            logo: null
          }
        };
      }
    }
  });

  React.useEffect(() => {
    if (schoolData?.school?.logo) {
      setLogoLoadFailed(false);
      setMobileLogoLoadFailed(false);
    }
  }, [schoolData?.school?.logo]);

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
      title: "ASA Assistant",
      icon: <Sparkles className="h-5 w-5" />,
    },
    {
      href: "/parent/home",
      title: "Dashboard",
      icon: <Home className="h-5 w-5" />,
    },
    {
      href: "/children",
      title: "My Children",
      icon: <Users className="h-5 w-5" />,
    },
    {
      href: "/parent/emergency-contacts",
      title: "Emergency Contacts",
      icon: <ShieldAlert className="h-5 w-5" />,
    },
    {
      href: "/parent/programs",
      title: "Programs & Classes",
      icon: <BookOpen className="h-5 w-5" />,
    },
    {
      href: "/schedule",
      title: "Family Schedule",
      icon: <Calendar className="h-5 w-5" />,
    },
    {
      href: "/notifications",
      title: "Notifications",
      icon: <Bell className="h-5 w-5" />,
    },
    {
      href: "/payments",
      title: "Payments",
      icon: <DollarSign className="h-5 w-5" />,
      isSectionHeader: true,
      subItems: [
        {
          href: "/payments",
          title: "Payments",
          icon: <DollarSign className="h-5 w-5" />,
        },
        {
          href: "/payment-methods",
          title: "Payment Methods",
          icon: <CreditCard className="h-5 w-5" />,
        },
      ],
    },
    {
      href: "/parent/documents",
      title: "My Documents",
      icon: <FolderOpen className="h-5 w-5" />,
    },
    {
      href: "/parent/progress",
      title: "Progress",
      icon: <TrendingUp className="h-5 w-5" />,
      description: "Multi-subject progress and reading"
    },
    {
      href: "/parent/assessments",
      title: "Reading Assessments",
      icon: <BookOpen className="h-5 w-5" />,
      description: "View reading assessments and Lexile scores"
    },
    ...(hasEducatorRole ? [
      {
        href: "/educator/dashboard",
        title: "Educator",
        icon: <GraduationCap className="h-5 w-5" />,
        isSectionHeader: true,
        subItems: [
          {
            href: "/educator/dashboard",
            title: "Educator Dashboard",
            icon: <Home className="h-5 w-5" />,
          },
          {
            href: "/educator/my-classes",
            title: "My Classes",
            icon: <BookOpen className="h-5 w-5" />,
          },
          {
            href: "/educator/students",
            title: "My Students",
            icon: <Users className="h-5 w-5" />,
          },
          {
            href: "/educator/weekly-calendar",
            title: "Schedule",
            icon: <Calendar className="h-5 w-5" />,
          },
          {
            href: "/educator/attendance",
            title: "Attendance",
            icon: <ClipboardList className="h-5 w-5" />,
          },
          {
            href: "/educator/my-hours",
            title: "My Hours",
            icon: <Clock className="h-5 w-5" />,
          },
        ],
      },
    ] : []),
    ...(canManageClasses ? [
      {
        href: "/schools/schedule-builder",
        title: "Academics",
        icon: <LayoutGrid className="h-5 w-5" />,
        isSectionHeader: true,
        subItems: [
          {
            href: "/schools/schedule-builder",
            title: "Weekly Templates",
            icon: <LayoutGrid className="h-5 w-5" />,
          },
          {
            href: "/schools/week-planner",
            title: "Week Planner",
            icon: <CalendarDays className="h-5 w-5" />,
          },
          {
            href: "/school-admin/assessments",
            title: "Assessments",
            icon: <ClipboardCheck className="h-5 w-5" />,
          },
          {
            href: "/school-admin/attendance",
            title: "Attendance",
            icon: <UserCheck className="h-5 w-5" />,
          },
        ],
      },
    ] : []),
    {
      href: "/settings",
      title: "Settings",
      icon: <Settings className="h-5 w-5" />,
    },
    ...(hasSchoolAdminRole ? [
      {
        href: "/school-admin",
        title: "School Admin",
        icon: <Building2 className="h-5 w-5" />,
        isSectionHeader: true,
        subItems: [
          {
            href: "/school-admin",
            title: "Admin Dashboard",
            icon: <Home className="h-5 w-5" />,
          },
          {
            href: "/school-admin/attendance",
            title: "Attendance",
            icon: <ClipboardList className="h-5 w-5" />,
          },
          {
            href: "/school-admin/assessments",
            title: "Assessments",
            icon: <BookOpen className="h-5 w-5" />,
          },
        ],
      },
    ] : []),
    ...(hasSuperAdminRole ? [{
      href: "/superadmin/schools",
      title: "Super Admin",
      icon: <Shield className="h-5 w-5" />,
    }] : []),
  ];

  const roleLabel = getRoleLabel(activeRole);

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
                  className="flex items-center justify-center flex-1 mr-2 font-semibold"
                >
                  {schoolData?.success && schoolData?.school?.logo && !mobileLogoLoadFailed ? (
                    <img 
                      src={schoolData.school.logo} 
                      alt={`${schoolData.school.name} Logo`}
                      className="h-8 max-w-[140px] object-contain"
                      onError={() => {
                        setMobileLogoLoadFailed(true);
                      }}
                    />
                  ) : schoolData?.success && schoolData?.school?.name ? (
                    <span className="text-xl">{schoolData.school.name}</span>
                  ) : (
                    <span className="text-xl">American Seekers Academy</span>
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
                <div className="flex items-center min-w-0 flex-1">
                  <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center mr-3 flex-shrink-0">
                    <User className="h-5 w-5 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">{user?.email}</p>
                    <p className="text-xs text-muted-foreground">
                      {roleLabel}
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
          <div className="flex items-center justify-center gap-2 px-2 py-4">
            <a
              href="/dashboard"
              className="flex items-center justify-center font-semibold"
            >
              {schoolData?.success && schoolData?.school?.logo && !logoLoadFailed ? (
                <img 
                  src={schoolData.school.logo} 
                  alt={`${schoolData.school.name} Logo`}
                  className="h-10 max-w-[180px] object-contain"
                  onError={() => {
                    setLogoLoadFailed(true);
                  }}
                />
              ) : schoolData?.success && schoolData?.school?.name ? (
                <span className="text-xl">{schoolData.school.name}</span>
              ) : (
                <span className="text-xl">American Seekers Academy</span>
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
              <div className="flex items-center min-w-0 flex-1">
                <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center mr-3 flex-shrink-0">
                  <User className="h-5 w-5 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate">{user?.email}</p>
                  <p className="text-xs text-muted-foreground">
                    {roleLabel}
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
