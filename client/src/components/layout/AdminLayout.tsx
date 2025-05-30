import React, { ReactNode } from 'react';
import { useLocation } from 'wouter';
import { Toaster } from '@/components/ui/toaster';
import { 
  Home, 
  Settings, 
  Menu, 
  Users, 
  School, 
  BookOpen, 
  Calendar, 
  Database,
  LogOut, 
  User,
  PieChart,
  FileText,
  BookOpenCheck,
  Shield
} from 'lucide-react';
import { useAuth } from "@/hooks/useAuth0";
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Separator } from '@/components/ui/separator';

type AdminLayoutProps = {
  children: ReactNode;
  pageTitle?: string;
};

const navItems = [
  { name: 'Dashboard', href: '/admin/dashboard', icon: <Home className="h-5 w-5" /> },
  { name: 'Users', href: '/admin/users', icon: <Users className="h-5 w-5" /> },
  { name: 'Schools', href: '/admin/schools', icon: <School className="h-5 w-5" /> },
  { name: 'Classes', href: '/admin/classes', icon: <Calendar className="h-5 w-5" /> },
  { name: 'Curriculum', href: '/admin/curriculum', icon: <BookOpen className="h-5 w-5" /> },
  { name: 'Knowledge Base', href: '/admin/knowledge-base', icon: <Database className="h-5 w-5" /> },
  { name: 'Reports', href: '/admin/reports', icon: <PieChart className="h-5 w-5" /> },
  { name: 'AI Tools', href: '/admin/ai-tools', icon: <BookOpenCheck className="h-5 w-5" /> },
  { name: 'Platform Overview', href: '/admin/features', icon: <FileText className="h-5 w-5" /> },
  { name: 'Roles & Permissions', href: '/admin/roles', icon: <Shield className="h-5 w-5" /> },
  { name: 'Settings', href: '/admin/settings', icon: <Settings className="h-5 w-5" /> },
];

export default function AdminLayout({ children, pageTitle = 'Admin Portal' }: AdminLayoutProps) {
  const [, navigate] = useLocation();
  const [location] = useLocation();
  const { user, isAuthenticated } = useAuth();

  const handleLogout = () => {
    // Implement logout functionality
    navigate('/login');
  };

  // If not authenticated, redirect to login
  if (!isAuthenticated) {
    return (
      <div className="flex items-center justify-center h-screen bg-muted/40">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Admin Access Required</h1>
          <p className="mb-6">Please log in to access the admin portal.</p>
          <Button onClick={() => navigate('/login')}>Go to Login</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-background">
      {/* Mobile menu */}
      <Sheet>
        <SheetTrigger asChild>
          <Button variant="outline" size="icon" className="md:hidden fixed top-4 left-4 z-50">
            <Menu className="h-5 w-5" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-64 p-0">
          <div className="flex flex-col h-full">
            <div className="p-4 border-b">
              <h2 className="text-lg font-semibold">Admin Portal</h2>
            </div>
            <nav className="flex-1 overflow-auto py-2">
              {navItems.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 px-4 py-2 text-sm transition-colors hover:bg-muted/50",
                    location === item.href ? "bg-muted font-medium" : "font-normal"
                  )}
                >
                  {item.icon}
                  {item.name}
                </a>
              ))}
            </nav>
          </div>
        </SheetContent>
      </Sheet>

      {/* Desktop sidebar */}
      <div className="hidden md:flex md:flex-col md:w-64 md:border-r bg-card">
        <div className="p-4 border-b">
          <h2 className="text-lg font-semibold">Admin Portal</h2>
        </div>
        <nav className="flex-1 overflow-auto py-2">
          {navItems.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-4 py-2 text-sm transition-colors hover:bg-muted/50",
                location === item.href ? "bg-muted font-medium" : "font-normal"
              )}
            >
              {item.icon}
              {item.name}
            </a>
          ))}
        </nav>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="border-b bg-card p-4">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-semibold">{pageTitle}</h1>
            <div className="flex items-center gap-4">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="rounded-full">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="text-xs">
                        {user?.name?.split(' ').map((n: string) => n[0]).join('') || 'AD'}
                      </AvatarFallback>
                    </Avatar>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>My Account</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => navigate('/admin/profile')}>
                    <User className="h-4 w-4 mr-2" />
                    Profile
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate('/admin/settings')}>
                    <Settings className="h-4 w-4 mr-2" />
                    Settings
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleLogout}>
                    <LogOut className="h-4 w-4 mr-2" />
                    Logout
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto bg-muted/30">
          {children}
        </main>
      </div>

      <Toaster />
    </div>
  );
}