import { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { useAuth } from "@/components/SupabaseProvider";
import { useRole } from "@/contexts/RoleContext";
import { cn } from '@/lib/utils';
import { 
  School, 
  BookOpen, 
  Users, 
  GraduationCap, 
  Calendar, 
  Settings, 
  Database,
  Menu,
  X,
  Home,
  LogOut,
  User,
  LucideIcon,
  Wand2,
  ChevronDown,
  ChevronRight,
  Building,
  FileText,
  Link2,
  MapPin,
  Bell,
  Clock,
  Percent,
  ClipboardList,
  BarChart3
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { apiRequest } from '@/lib/queryClient';

// Sidebar navigation items for school admins
const schoolNavItems: {
  title: string;
  href: string;
  icon: LucideIcon;
  subitems?: { title: string; href: string }[];
}[] = [
  {
    title: 'Dashboard',
    href: '/schools/dashboard',
    icon: Home,
  },
  {
    title: 'My School',
    href: '/schools/my-school',
    icon: School,
  },
  {
    title: 'Classes',
    href: '/schools/classes',
    icon: BookOpen,
  },
  {
    title: 'Staff',
    href: '/schools/staff',
    icon: Users,
  },
  {
    title: 'Students',
    href: '/schools/students',
    icon: GraduationCap,
  },
  {
    title: 'Forms',
    href: '/school-admin/forms',
    icon: ClipboardList,
  },
  {
    title: 'Knowledge Base',
    href: '/schools/knowledge-base',
    icon: Database,
  },
  {
    title: 'Marketing Links',
    href: '/schools/marketing-links',
    icon: Link2,
  },
  {
    title: 'Locations',
    href: '/schools/locations',
    icon: MapPin,
  },
  {
    title: 'Notifications',
    href: '/schools/notifications',
    icon: Bell,
  },
  {
    title: 'AI Tools',
    href: '/ai-generator',
    icon: Wand2,
    subitems: [
      { title: 'Lesson Generator', href: '/lessons/ai-generator' },
      { title: 'Worksheet Generator', href: '/ai-generator/worksheet' },
      { title: 'Activity Generator', href: '/ai-generator/activity' },
      { title: 'OCR Tools', href: '/ai-generator/ocr' }
    ]
  },
  {
    title: 'Calendar',
    href: '/schools/calendar',
    icon: Calendar,
  },
  {
    title: 'Daily Flows',
    href: '/schools/daily-flows',
    icon: Clock,
    subitems: [
      { title: 'Templates', href: '/schools/daily-flows/templates' },
      { title: 'View Entries', href: '/schools/daily-flows/entries' },
      { title: 'Reports', href: '/schools/daily-flows/reports' }
    ]
  },
  {
    title: 'Discounts',
    href: '/schools/discounts',
    icon: Percent,
  },
  {
    title: 'Financial Reports',
    href: '/school-admin/financial-reports',
    icon: BarChart3,
  },
  {
    title: 'Settings',
    href: '/schools/settings',
    icon: Settings,
  },
];

// Sidebar navigation items for super admin
const superAdminNavItems: {
  title: string;
  href: string;
  icon: LucideIcon;
  subitems?: { title: string; href: string }[];
}[] = [
  {
    title: 'Dashboard',
    href: '/dashboard',
    icon: Home,
  },
  {
    title: 'All Schools',
    href: '/superadmin/schools',
    icon: Building,
  },
  {
    title: 'Applications',
    href: '/superadmin/applications',
    icon: FileText,
  },
  {
    title: 'My School',
    href: '/schools/my-school',
    icon: School,
  },
  {
    title: 'Classes',
    href: '/schools/classes',
    icon: BookOpen,
  },
  {
    title: 'Staff',
    href: '/schools/staff',
    icon: Users,
  },
  {
    title: 'Students',
    href: '/schools/students',
    icon: GraduationCap,
  },
  {
    title: 'Knowledge Base',
    href: '/schools/knowledge-base',
    icon: Database,
  },
  {
    title: 'Marketing Links',
    href: '/schools/marketing-links',
    icon: Link2,
  },
  {
    title: 'Locations',
    href: '/schools/locations',
    icon: MapPin,
  },
  {
    title: 'Notifications',
    href: '/schools/notifications',
    icon: Bell,
  },
  {
    title: 'AI Tools',
    href: '/ai-generator',
    icon: Wand2,
    subitems: [
      { title: 'Lesson Generator', href: '/lessons/ai-generator' },
      { title: 'Worksheet Generator', href: '/ai-generator/worksheet' },
      { title: 'Activity Generator', href: '/ai-generator/activity' },
      { title: 'OCR Tools', href: '/ai-generator/ocr' }
    ]
  },
  {
    title: 'Calendar',
    href: '/schools/calendar',
    icon: Calendar,
  },
  {
    title: 'Discounts',
    href: '/schools/discounts',
    icon: Percent,
  },
  {
    title: 'Settings',
    href: '/schools/settings',
    icon: Settings,
  },
];

// Sidebar navigation items for educators (limited scope)
const educatorNavItems: {
  title: string;
  href: string;
  icon: LucideIcon;
  subitems?: { title: string; href: string }[];
}[] = [
  {
    title: 'Dashboard',
    href: '/dashboard',
    icon: Home,
  },
  {
    title: 'My Classes',
    href: '/educator/classes',
    icon: BookOpen,
  },
  {
    title: 'My Students',
    href: '/educator/students',
    icon: GraduationCap,
  },
  {
    title: 'Schedule',
    href: '/educator/schedule',
    icon: Calendar,
  },
  {
    title: 'Notifications',
    href: '/educator/notifications',
    icon: Bell,
  },
  {
    title: 'Daily Flows',
    href: '/educator/daily-flows',
    icon: Clock,
  },
  {
    title: 'Settings',
    href: '/educator/settings',
    icon: Settings,
  },
];

// Sidebar navigation items for parents
const parentNavItems: {
  title: string;
  href: string;
  icon: LucideIcon;
  subitems?: { title: string; href: string }[];
}[] = [
  {
    title: 'Dashboard',
    href: '/dashboard',
    icon: Home,
  },
  {
    title: 'My Children',
    href: '/children',
    icon: Users,
  },
  {
    title: 'Programs',
    href: '/programs',
    icon: BookOpen,
  },
  {
    title: 'Calendar',
    href: '/calendar',
    icon: Calendar,
  },
  {
    title: 'Payments',
    href: '/billing',
    icon: Settings,
  },
];

export default function Sidebar() {
  const [location] = useLocation();
  const { user, signOut, isAuthenticated } = useAuth();
  const { activeRole } = useRole();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  const toggleSidebar = () => {
    setIsCollapsed(!isCollapsed);
  };

  const toggleExpanded = (itemTitle: string) => {
    const newExpanded = new Set(expandedItems);
    if (newExpanded.has(itemTitle)) {
      newExpanded.delete(itemTitle);
    } else {
      newExpanded.add(itemTitle);
    }
    setExpandedItems(newExpanded);
  };

  const handleLogout = async () => {
    console.log('🚪 Sidebar logout clicked');
    await signOut();
  };

  // Choose navigation items based on role
  const getNavItems = () => {
    if (activeRole === 'superAdmin') {
      return superAdminNavItems;
    } else if (activeRole === 'educator') {
      return educatorNavItems;
    } else if (activeRole === 'parent') {
      return parentNavItems;
    } else if (activeRole === 'schoolAdmin') {
      return schoolNavItems;
    } else {
      // Fallback for unknown roles - show minimal navigation
      return parentNavItems;
    }
  };
  
  const navItems = getNavItems();

  return (
    <>
      <div 
        className={cn(
          "hidden md:flex h-screen flex-col border-r transition-all duration-300",
          isCollapsed ? "w-[70px]" : "w-64"
        )}
      >
        <div className="flex h-14 items-center border-b px-3">
          <div className={cn(
            "flex items-center justify-between w-full",
            isCollapsed ? "justify-center" : "justify-between"
          )}>
            {!isCollapsed && (
              <Link href="/">
                <span className="font-bold text-xl">ASA Platform</span>
              </Link>
            )}
            <Button variant="ghost" size="icon" onClick={toggleSidebar}>
              {isCollapsed ? <Menu /> : <X />}
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto py-2">
          <nav className="grid gap-1 px-2" data-testid="sidebar-navigation">
            {navItems.map((item) => {
              const isActive = location === item.href || location.startsWith(`${item.href}/`) ||
                (item.subitems && item.subitems.some(sub => location === sub.href || location.startsWith(`${sub.href}/`)));
              const isExpanded = expandedItems.has(item.title);

              return (
                <div key={item.href}>
                  {item.subitems ? (
                    // Menu item with subitems (expandable)
                    <div>
                      <div
                        onClick={() => toggleExpanded(item.title)}
                        className={cn(
                          "flex items-center gap-3 rounded-lg px-3 py-2 transition-all cursor-pointer",
                          isActive ? "bg-blue-600 text-white" : "text-gray-700 hover:bg-gray-100",
                          isCollapsed ? "justify-center" : "justify-between"
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <item.icon className={cn("h-5 w-5", isActive ? "text-white" : "text-muted-foreground")} />
                          {!isCollapsed && <span>{item.title}</span>}
                        </div>
                        {!isCollapsed && (
                          isExpanded ? 
                            <ChevronDown className={cn("h-4 w-4", isActive ? "text-white" : "text-muted-foreground")} /> :
                            <ChevronRight className={cn("h-4 w-4", isActive ? "text-white" : "text-muted-foreground")} />
                        )}
                      </div>
                      
                      {/* Subitems */}
                      {isExpanded && !isCollapsed && (
                        <div className="ml-6 mt-1 space-y-1">
                          {item.subitems.map((subitem) => {
                            const isSubActive = location === subitem.href || location.startsWith(`${subitem.href}/`);
                            return (
                              <Link key={subitem.href} href={subitem.href}>
                                <div
                                  className={cn(
                                    "flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-all cursor-pointer",
                                    isSubActive ? "bg-blue-500 text-white" : "text-gray-600 hover:bg-gray-50"
                                  )}
                                >
                                  <span>{subitem.title}</span>
                                </div>
                              </Link>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ) : (
                    // Regular menu item without subitems
                    <Link href={item.href}>
                      <div
                        className={cn(
                          "flex items-center gap-3 rounded-lg px-3 py-2 transition-all cursor-pointer",
                          isActive ? "bg-blue-600 text-white" : "text-gray-700 hover:bg-gray-100",
                          isCollapsed ? "justify-center" : "justify-start"
                        )}
                      >
                        <item.icon className={cn("h-5 w-5", isActive ? "text-white" : "text-muted-foreground")} />
                        {!isCollapsed && <span>{item.title}</span>}
                      </div>
                    </Link>
                  )}
                </div>
              );
            })}
          </nav>
        </div>

        <div className="border-t p-4">
          {isAuthenticated && user && (
            <div className={cn("flex items-center", isCollapsed ? "justify-center" : "justify-between")}>
              {!isCollapsed && (
                <div className="flex items-center gap-2">
                  <div className="rounded-full bg-primary/10 p-1">
                    <User className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <div className="text-sm font-medium">{user.user_metadata?.full_name || user.email}</div>
                    <div className="text-xs text-muted-foreground">
                      {activeRole === 'parent' ? 'Parent Account' : 
                       activeRole === 'superAdmin' ? 'Super Administrator' :
                       activeRole === 'admin' ? 'Administrator' :
                       activeRole === 'educator' ? 'Educator' :
                       activeRole === 'schoolAdmin' ? 'School Administrator' :
                       'User'}
                    </div>
                  </div>
                </div>
              )}

              <Button 
                variant="ghost" 
                size={isCollapsed ? "icon" : "sm"} 
                onClick={handleLogout}
                className={isCollapsed ? "ml-0" : "ml-auto"}
              >
                <LogOut className="h-4 w-4" />
                {!isCollapsed && <span className="ml-1">Logout</span>}
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Mobile sidebar button */}
      <Button 
        variant="outline" 
        size="icon" 
        className="absolute top-4 left-4 z-50 md:hidden"
        onClick={toggleSidebar}
      >
        <Menu className="h-6 w-6" />
      </Button>

      {/* Mobile sidebar drawer */}
      {!isCollapsed && (
        <div className="md:hidden fixed inset-0 z-40 bg-background/80 backdrop-blur-sm" onClick={toggleSidebar}>
          <div 
            className="fixed inset-y-0 left-0 z-50 w-3/4 max-w-xs bg-background border-r shadow-lg" 
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex h-14 items-center border-b px-4">
              <Link href="/">
                <span className="font-bold text-xl">ASA Platform</span>
              </Link>
              <Button variant="ghost" size="icon" className="ml-auto" onClick={toggleSidebar}>
                <X className="h-5 w-5" />
              </Button>
            </div>

            <div className="py-4">
              <nav className="grid gap-1 px-2">
                {schoolNavItems.map((item) => {
                  const isActive = location === item.href || location.startsWith(`${item.href}/`);

                  return (
                    <div key={item.href}>
                      <Link href={item.href}>
                        <div
                          className={cn(
                            "flex items-center gap-3 rounded-lg px-3 py-2 transition-all cursor-pointer",
                            isActive ? "bg-blue-600 text-white" : "text-gray-700 hover:bg-gray-100"
                          )}
                          onClick={toggleSidebar}
                        >
                          <item.icon className={cn("h-5 w-5", isActive ? "text-white" : "text-muted-foreground")} />
                          <span>{item.title}</span>
                        </div>
                      </Link>
                    </div>
                  );
                })}
              </nav>
            </div>

            <div className="border-t p-4 mt-auto">
              {isAuthenticated && user && (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="rounded-full bg-primary/10 p-1">
                      <User className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <div className="text-sm font-medium">{user.user_metadata?.full_name || user.email}</div>
                      <div className="text-xs text-muted-foreground">
                        {activeRole === 'parent' ? 'Parent Account' : 
                         activeRole === 'superAdmin' ? 'Super Administrator' :
                         activeRole === 'admin' ? 'Administrator' :
                         activeRole === 'educator' ? 'Educator' :
                         activeRole === 'schoolAdmin' ? 'School Administrator' :
                         'User'}
                      </div>
                    </div>
                  </div>

                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={handleLogout}
                    className="ml-auto"
                  >
                    <LogOut className="h-4 w-4" />
                    <span className="ml-1">Logout</span>
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}