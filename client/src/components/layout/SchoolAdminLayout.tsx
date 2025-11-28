import React from "react";
import UnifiedSchoolAdminSidebar from "./UnifiedSchoolAdminSidebar";
import RoleSwitcher from "@/components/RoleSwitcher";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";

interface SchoolAdminLayoutProps {
  children: React.ReactNode;
  pageTitle: string;
}

export default function SchoolAdminLayout({ children, pageTitle }: SchoolAdminLayoutProps) {
  const { data: notifications = [] } = useQuery<any[]>({
    queryKey: ['/api/notifications'],
  });
  
  const unreadNotifications = notifications.filter((n: any) => !n.read).length;

  return (
    <div className="flex h-screen bg-gray-100">
      <UnifiedSchoolAdminSidebar />
      
      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Page header - with padding to account for mobile hamburger menu */}
        <header className="bg-white shadow-sm z-10">
          <div className="px-4 md:px-4 pl-16 md:pl-4 py-3 flex items-center justify-between">
            <h1 className="text-2xl font-semibold text-gray-800">{pageTitle}</h1>
            
            {/* Right side actions - Role Switcher and Notifications */}
            <div className="hidden md:flex items-center gap-4">
              <RoleSwitcher />
              
              {/* Notification Bell */}
              <Link href="/school-admin/notifications">
                <Button variant="ghost" size="icon" className="relative" data-testid="button-notifications-header">
                  <Bell className="h-5 w-5" />
                  {unreadNotifications > 0 && (
                    <Badge 
                      variant="destructive" 
                      className="absolute -top-1 -right-1 h-5 w-5 rounded-full p-0 flex items-center justify-center text-xs"
                      data-testid="badge-notification-count-header"
                    >
                      {unreadNotifications > 9 ? '9+' : unreadNotifications}
                    </Badge>
                  )}
                </Button>
              </Link>
            </div>
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