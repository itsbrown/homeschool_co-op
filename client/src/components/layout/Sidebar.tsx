import { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { useFirebaseAuth } from '@/hooks/useFirebaseAuth';
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
  LucideIcon
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
    title: 'Knowledge Base',
    href: '/schools/knowledge-base',
    icon: Database,
  },
  {
    title: 'Calendar',
    href: '/schools/calendar',
    icon: Calendar,
  },
  {
    title: 'Settings',
    href: '/schools/settings',
    icon: Settings,
  },
];

export default function Sidebar() {
  const [location] = useLocation();
  const { user, isAuthenticated } = useFirebaseAuth();
  const [isCollapsed, setIsCollapsed] = useState(false);

  const toggleSidebar = () => {
    setIsCollapsed(!isCollapsed);
  };

  const handleLogout = async () => {
    try {
      await apiRequest('POST', '/api/auth/logout');
      window.location.href = '/login';
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

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
        
        <div className="flex-1 overflow-auto py-2">
          <nav className="grid gap-1 px-2">
            {schoolNavItems.map((item) => {
              const isActive = location === item.href || location.startsWith(`${item.href}/`);
              
              return (
                <div key={item.href}>
                  <Link href={item.href}>
                    <div
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-3 py-2 transition-all cursor-pointer",
                        isActive ? "bg-accent text-accent-foreground" : "hover:bg-accent/50",
                        isCollapsed ? "justify-center" : "justify-start"
                      )}
                    >
                      <item.icon className={cn("h-5 w-5", isActive ? "text-primary" : "text-muted-foreground")} />
                      {!isCollapsed && <span>{item.title}</span>}
                    </div>
                  </Link>
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
                    <div className="text-sm font-medium">School Admin</div>
                    <div className="text-xs text-muted-foreground">Administrator</div>
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
                            isActive ? "bg-accent text-accent-foreground" : "hover:bg-accent/50"
                          )}
                          onClick={toggleSidebar}
                        >
                          <item.icon className={cn("h-5 w-5", isActive ? "text-primary" : "text-muted-foreground")} />
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
                      <div className="text-sm font-medium">School Admin</div>
                      <div className="text-xs text-muted-foreground">Administrator</div>
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