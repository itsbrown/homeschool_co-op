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
  Link2,
  MapPin,
  Bell,
  Target,
  CreditCard,
  UserPlus
} from 'lucide-react';
import { Button } from '@/components/ui/button';

interface NavItem {
  title: string;
  href: string;
  icon: LucideIcon;
}

// Navigation items for school administrators
const adminNavItems: NavItem[] = [
  {
    title: 'Dashboard',
    href: '/dashboard',
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
    title: 'Users',
    href: '/schools/users',
    icon: UserPlus,
  },
  {
    title: 'Discounts',
    href: '/schools/discounts',
    icon: Target,
  },
  {
    title: 'Manual Payments',
    href: '/schools/manual-payments',
    icon: CreditCard,
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
    title: 'Settings',
    href: '/schools/settings',
    icon: Settings,
  },
];

// Navigation items for educators (limited scope)
const educatorNavItems: NavItem[] = [
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
    title: 'Settings',
    href: '/settings',
    icon: Settings,
  },
];

interface SidebarProps {
  className?: string;
}

export default function UnifiedSchoolAdminSidebar({ className }: SidebarProps) {
  const [location] = useLocation();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const { user, isAuthenticated, signOut } = useAuth();
  const { activeRole } = useRole();

  // Get appropriate navigation items based on role
  const getNavItems = () => {
    if (activeRole === 'educator') {
      return educatorNavItems;
    }
    return adminNavItems; // Default for admin roles
  };

  // Get role display name
  const getRoleDisplayName = () => {
    switch (activeRole) {
      case 'educator':
        return 'Educator';
      case 'school_admin':
        return 'School Administrator';
      case 'superAdmin':
        return 'Super Administrator';
      default:
        return 'School Administrator';
    }
  };

  const navItems = getNavItems();

  const toggleSidebar = () => {
    setIsCollapsed(!isCollapsed);
  };

  const handleLogout = async () => {
    console.log('🚪 School admin sidebar logout clicked');
    await signOut();
  };

  return (
    <>
      {/* Desktop Sidebar */}
      <div 
        className={cn(
          "hidden md:flex h-screen flex-col border-r bg-white transition-all duration-300",
          isCollapsed ? "w-[70px]" : "w-64",
          className
        )}
      >
        {/* Header */}
        <div className="flex h-14 items-center border-b px-3">
          <div className={cn(
            "flex items-center justify-between w-full",
            isCollapsed ? "justify-center" : "justify-between"
          )}>
            {!isCollapsed && (
              <Link href="/">
                <span className="font-bold text-xl text-gray-800">ASA Platform</span>
              </Link>
            )}
            <Button variant="ghost" size="icon" onClick={toggleSidebar}>
              {isCollapsed ? <Menu className="h-5 w-5" /> : <X className="h-5 w-5" />}
            </Button>
          </div>
        </div>
        
        {/* Navigation */}
        <div className="flex-1 overflow-auto py-2">
          <nav className="grid gap-1 px-2">
            {navItems.map((item) => {
              const isActive = location === item.href || location.startsWith(`${item.href}/`);
              
              return (
                <Link key={item.href} href={item.href}>
                  <div
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2 transition-all cursor-pointer",
                      isActive 
                        ? "bg-blue-600 text-white" 
                        : "text-gray-700 hover:bg-gray-100",
                      isCollapsed ? "justify-center" : "justify-start"
                    )}
                  >
                    <item.icon className="h-5 w-5" />
                    {!isCollapsed && <span className="font-medium">{item.title}</span>}
                  </div>
                </Link>
              );
            })}
          </nav>
        </div>
        
        {/* User Profile & Logout */}
        <div className="border-t p-4">
          {isAuthenticated && user && (
            <div className={cn("flex items-center", isCollapsed ? "justify-center" : "justify-between")}>
              {!isCollapsed && (
                <div className="flex items-center gap-2">
                  <div className="rounded-full bg-blue-100 p-2">
                    <User className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-gray-900">{user.user_metadata?.full_name || user.email}</div>
                    <div className="text-xs text-gray-500">{getRoleDisplayName()}</div>
                  </div>
                </div>
              )}
              
              <Button 
                variant="ghost" 
                size={isCollapsed ? "icon" : "sm"} 
                onClick={handleLogout}
                className={cn(
                  "text-gray-600 hover:text-gray-900 hover:bg-gray-100",
                  isCollapsed ? "ml-0" : "ml-auto"
                )}
              >
                <LogOut className="h-4 w-4" />
                {!isCollapsed && <span className="ml-1">Logout</span>}
              </Button>
            </div>
          )}
        </div>
      </div>
      
      {/* Mobile Sidebar */}
      <div className="md:hidden">
        {/* Mobile sidebar button */}
        <Button 
          variant="outline" 
          size="icon" 
          className="fixed top-4 left-4 z-50"
          onClick={toggleSidebar}
        >
          <Menu className="h-6 w-6" />
        </Button>
        
        {/* Mobile sidebar drawer */}
        {!isCollapsed && (
          <div className="fixed inset-0 z-40 bg-black/50" onClick={toggleSidebar}>
            <div 
              className="fixed inset-y-0 left-0 z-50 w-3/4 max-w-xs bg-white border-r shadow-lg" 
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex h-14 items-center border-b px-4">
                <Link href="/">
                  <span className="font-bold text-xl text-gray-800">ASA Platform</span>
                </Link>
                <Button variant="ghost" size="icon" className="ml-auto" onClick={toggleSidebar}>
                  <X className="h-5 w-5" />
                </Button>
              </div>
              
              <div className="py-4">
                <nav className="grid gap-1 px-2">
                  {navItems.map((item) => {
                    const isActive = location === item.href || location.startsWith(`${item.href}/`);
                    
                    return (
                      <Link key={item.href} href={item.href}>
                        <div
                          className={cn(
                            "flex items-center gap-3 rounded-lg px-3 py-2 transition-all cursor-pointer",
                            isActive 
                              ? "bg-blue-600 text-white" 
                              : "text-gray-700 hover:bg-gray-100"
                          )}
                          onClick={toggleSidebar}
                        >
                          <item.icon className="h-5 w-5" />
                          <span className="font-medium">{item.title}</span>
                        </div>
                      </Link>
                    );
                  })}
                </nav>
              </div>
              
              <div className="border-t p-4 mt-auto">
                {isAuthenticated && user && (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="rounded-full bg-blue-100 p-2">
                        <User className="h-5 w-5 text-blue-600" />
                      </div>
                      <div>
                        <div className="text-sm font-medium text-gray-900">{user.user_metadata?.full_name || user.email}</div>
                        <div className="text-xs text-gray-500">{getRoleDisplayName()}</div>
                      </div>
                    </div>
                    
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={handleLogout}
                      className="ml-auto text-gray-600 hover:text-gray-900 hover:bg-gray-100"
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
      </div>
    </>
  );
}