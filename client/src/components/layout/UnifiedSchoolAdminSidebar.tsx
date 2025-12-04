import { useState, useEffect } from 'react';
import { Link, useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from "@/components/SupabaseProvider";
import { useRole } from "@/contexts/RoleContext";
import { cn } from '@/lib/utils';
import RoleSwitcher from "@/components/RoleSwitcher";
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
  UserPlus,
  ClipboardList,
  Tag,
  FileText
} from 'lucide-react';
import { Button } from '@/components/ui/button';

interface SchoolData {
  id: number;
  name: string;
  logo?: string;
}

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
    title: 'Enrollments',
    href: '/schools/enrollments',
    icon: GraduationCap,
  },
  {
    title: 'Users',
    href: '/schools/users',
    icon: UserPlus,
  },
  {
    title: 'Forms',
    href: '/school-admin/forms',
    icon: ClipboardList,
  },
  {
    title: 'Documents',
    href: '/school-admin/documents',
    icon: FileText,
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
    title: 'Categories',
    href: '/schools/categories',
    icon: Tag,
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
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [logoLoadFailed, setLogoLoadFailed] = useState(false);
  const [mobileLogoLoadFailed, setMobileLogoLoadFailed] = useState(false);
  const { user, isAuthenticated, signOut } = useAuth();
  const { activeRole } = useRole();

  // Fetch school data for logo and name
  const { data: schoolData } = useQuery<SchoolData>({
    queryKey: ['/api/school-admin/my-school'],
    enabled: !!user && (activeRole === 'schoolAdmin' || activeRole === 'superAdmin' || activeRole === 'educator'),
  });

  // Reset logo load failed states when school logo changes
  useEffect(() => {
    if (schoolData?.logo) {
      setLogoLoadFailed(false);
      setMobileLogoLoadFailed(false);
    }
  }, [schoolData?.logo]);

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
      case 'schoolAdmin':
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

  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
  };

  const closeMobileMenu = () => {
    setIsMobileMenuOpen(false);
  };

  const handleLogout = async () => {
    console.log('🚪 School admin sidebar logout clicked');
    await signOut();
  };

  // Auto-close mobile menu on route changes
  useEffect(() => {
    closeMobileMenu();
  }, [location]);

  // Close mobile menu on Esc key
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isMobileMenuOpen) {
        closeMobileMenu();
      }
    };
    
    if (isMobileMenuOpen) {
      document.addEventListener('keydown', handleEsc);
      return () => document.removeEventListener('keydown', handleEsc);
    }
  }, [isMobileMenuOpen]);

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
            {!isCollapsed ? (
              <Link href="/" data-testid="sidebar-logo-link" className="flex items-center justify-center flex-1 mr-2">
                {schoolData?.logo && !logoLoadFailed ? (
                  <img 
                    src={schoolData.logo} 
                    alt={`${schoolData.name} Logo`}
                    className="h-10 max-w-[180px] object-contain"
                    onError={() => {
                      setLogoLoadFailed(true);
                    }}
                  />
                ) : schoolData?.name ? (
                  <span className="font-bold text-xl text-gray-800">{schoolData.name}</span>
                ) : (
                  <span className="font-bold text-xl text-gray-800">ASA Platform</span>
                )}
              </Link>
            ) : (
              <Link href="/" data-testid="sidebar-logo-link-collapsed" className="flex items-center justify-center">
                {schoolData?.logo && !logoLoadFailed ? (
                  <img 
                    src={schoolData.logo} 
                    alt={`${schoolData.name} Logo`}
                    className="h-8 w-8 object-contain"
                    onError={() => {
                      setLogoLoadFailed(true);
                    }}
                  />
                ) : schoolData?.name ? (
                  <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-semibold text-sm">
                    {schoolData.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)}
                  </div>
                ) : (
                  <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-semibold text-sm">
                    ASA
                  </div>
                )}
              </Link>
            )}
            <Button variant="ghost" size="icon" onClick={toggleSidebar} data-testid="sidebar-toggle-button">
              {isCollapsed ? <Menu className="h-5 w-5" /> : <X className="h-5 w-5" />}
            </Button>
          </div>
        </div>
        
        {/* Navigation */}
        <div className="flex-1 overflow-y-auto py-2">
          <nav className="grid gap-1 px-2" data-testid="admin-sidebar-navigation">
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
                    data-testid={`nav-${item.href.replace(/\//g, '-')}`}
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
          onClick={toggleMobileMenu}
          aria-expanded={isMobileMenuOpen}
          aria-controls="mobile-navigation"
          aria-label="Toggle navigation menu"
          data-testid="mobile-menu-toggle"
        >
          <Menu className="h-6 w-6" />
        </Button>
        
        {/* Mobile sidebar drawer */}
        {isMobileMenuOpen && (
          <div className="md:hidden fixed inset-0 z-40 bg-black/50" onClick={closeMobileMenu}>
            <div 
              className="fixed inset-y-0 left-0 z-50 w-3/4 max-w-xs bg-white border-r shadow-lg flex flex-col" 
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex h-14 items-center border-b px-4 flex-shrink-0">
                <Link href="/" data-testid="mobile-sidebar-logo-link" className="flex items-center justify-center flex-1 mr-2">
                  {schoolData?.logo && !mobileLogoLoadFailed ? (
                    <img 
                      src={schoolData.logo} 
                      alt={`${schoolData.name} Logo`}
                      className="h-8 max-w-[140px] object-contain"
                      onError={() => {
                        setMobileLogoLoadFailed(true);
                      }}
                    />
                  ) : schoolData?.name ? (
                    <span className="font-bold text-lg text-gray-800">{schoolData.name}</span>
                  ) : (
                    <span className="font-bold text-lg text-gray-800">ASA Platform</span>
                  )}
                </Link>
                <Button variant="ghost" size="icon" className="ml-auto" onClick={closeMobileMenu} data-testid="mobile-menu-close">
                  <X className="h-5 w-5" />
                </Button>
              </div>
              
              {/* Navigation - Scrollable */}
              <div className="flex-1 overflow-y-auto py-4">
                <nav id="mobile-navigation" className="grid gap-1 px-2">
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
                          onClick={closeMobileMenu}
                          data-testid={`mobile-nav-${item.href.replace(/\//g, '-')}`}
                        >
                          <item.icon className="h-5 w-5" />
                          <span className="font-medium">{item.title}</span>
                        </div>
                      </Link>
                    );
                  })}
                </nav>
              </div>
              
              {/* Role Switcher */}
              <div className="border-t p-4 flex-shrink-0">
                <RoleSwitcher />
              </div>
              
              {/* Footer - User Profile & Logout */}
              <div className="border-t p-4 flex-shrink-0">
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
                      data-testid="mobile-logout-button"
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