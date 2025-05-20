import React from 'react';
import { useLocation } from 'wouter';
import { Home, Users, BookOpen, Calendar, Settings, FileText, School, ChevronLeft, Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';

interface NavItem {
  title: string;
  href: string;
  icon: React.ReactNode;
}

interface DashboardLayoutProps {
  children: React.ReactNode;
  pageTitle: string;
}

export default function DashboardLayout({ children, pageTitle }: DashboardLayoutProps) {
  const [location] = useLocation();
  const [sidebarOpen, setSidebarOpen] = React.useState(true);
  const { user } = useAuth();
  
  // School admin navigation
  const schoolNavItems: NavItem[] = [
    {
      title: 'My School',
      href: '/schools/my-school',
      icon: <School className="h-5 w-5" />,
    },
    {
      title: 'Classes',
      href: '/schools/classes',
      icon: <Calendar className="h-5 w-5" />,
    },
    {
      title: 'Staff',
      href: '/schools/staff',
      icon: <Users className="h-5 w-5" />,
    },
    {
      title: 'Students',
      href: '/schools/students',
      icon: <Users className="h-5 w-5" />,
    },
    {
      title: 'Knowledge Base',
      href: '/schools/knowledge-base',
      icon: <BookOpen className="h-5 w-5" />,
    },
  ];

  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen);
  };

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar */}
      <div className={cn(
        "bg-white shadow-lg transition-all duration-300 flex flex-col",
        sidebarOpen ? "w-64" : "w-16"
      )}>
        {/* Sidebar header */}
        <div className="p-4 flex items-center justify-between border-b">
          {sidebarOpen && (
            <h2 className="text-xl font-bold">School Admin</h2>
          )}
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={toggleSidebar}
            className="ml-auto"
          >
            {sidebarOpen ? <ChevronLeft className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
        
        {/* Sidebar content */}
        <div className="flex-1 overflow-y-auto py-4 px-3">
          <nav className="space-y-2">
            {schoolNavItems.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center px-2 py-3 rounded-lg transition-colors",
                  location === item.href
                    ? "bg-primary text-white"
                    : "text-gray-700 hover:bg-gray-100",
                  !sidebarOpen && "justify-center"
                )}
              >
                {item.icon}
                {sidebarOpen && <span className="ml-3">{item.title}</span>}
              </a>
            ))}
          </nav>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Page header */}
        <header className="bg-white shadow-sm z-10">
          <div className="px-4 py-3 flex items-center">
            <h1 className="text-2xl font-semibold text-gray-800">{pageTitle}</h1>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-4 bg-gray-50">
          {children}
        </main>
      </div>
    </div>
  );
}