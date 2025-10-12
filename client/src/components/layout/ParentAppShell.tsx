import React, { useState, useEffect } from "react";
import { useAuth } from "@/components/SupabaseProvider";
import { useRole } from "@/contexts/RoleContext";
import { CartProvider } from "@/contexts/CartContext";
import ParentSidebar from "./ParentSidebar";
import CartDrawer from "@/components/cart/CartDrawer";
import CartButton from "@/components/cart/CartButton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LogOut, Menu, User, Bell } from "lucide-react";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";

interface ParentAppShellProps {
  children: React.ReactNode;
}

interface Notification {
  id: number;
  recipientStatus?: string;
}

export default function ParentAppShell({ children }: ParentAppShellProps) {
  const { user, signOut, isAuthenticated } = useAuth();
  const { activeRole } = useRole();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userSchool, setUserSchool] = useState<any>(null);

  // Fetch notifications to get unread count
  const userRole = localStorage.getItem('activeRole') || 'parent';
  const notificationsUrl = `/api/notifications?userId=${user?.id}&role=${userRole}`;
  const { data: notifications = [] } = useQuery<Notification[]>({
    queryKey: [notificationsUrl],
    enabled: !!user?.id,
  });
  
  const unreadNotifications = notifications.filter(n => n.recipientStatus !== "read").length;

  const handleLogout = async () => {
    console.log('🚪 ParentAppShell logout clicked');
    await signOut();
  };

  // Fetch user's associated school - simplified to use school ID 1 for now
  useEffect(() => {
    if (user?.email) {
      const fetchUserSchool = async () => {
        try {
          // First try to get school association through school-parents API
          const response = await apiRequest("GET", `/api/school-parents/school/${user.email}`);
          if (response.ok) {
            const result = await response.json();
            if (result.success && result.school) {
              setUserSchool(result.school);
              return;
            }
          }

          // Fallback: Since most parents are associated with American Seekers Academy (ID: 1)
          // directly fetch school data
          const schoolResponse = await apiRequest("GET", "/api/schools/1");
          if (schoolResponse.ok) {
            const schoolData = await schoolResponse.json();
            setUserSchool(schoolData);
          }
        } catch (error) {
          console.log('No school association found for user, using default school');
          // Final fallback: use the known school data
          setUserSchool({
            id: 1,
            name: "American Seekers Academy",
            logo: "/uploads/logos/school-logo-1755810269716.png"
          });
        }
      };
      fetchUserSchool();
    }
  }, [user?.email]);

  // Return early if not authenticated
  if (!isAuthenticated) {
    return null;
  }

  return (
    <CartProvider>
      <div className="min-h-screen bg-gray-50">
        {/* Mobile sidebar */}
        <div className={cn(
          "fixed inset-0 z-50 lg:hidden",
          sidebarOpen ? "block" : "hidden"
        )}>
          <div className="fixed inset-0 bg-gray-600 bg-opacity-75" onClick={() => setSidebarOpen(false)} />
          <div className="relative flex w-64 flex-col bg-white">
            <ParentSidebar />
          </div>
        </div>

        {/* Desktop sidebar */}
        <div className="hidden lg:fixed lg:inset-y-0 lg:flex lg:w-64 lg:flex-col">
          <ParentSidebar />
        </div>

        {/* Main content area */}
        <div className="lg:pl-64">
          {/* Mobile header */}
          <div className="lg:hidden">
            <div className="flex items-center justify-between bg-white px-4 py-3 shadow-sm border-b">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSidebarOpen(true)}
              >
                <Menu className="h-6 w-6" />
              </Button>

              <div className="flex items-center gap-2">
                {userSchool?.logo && (
                  <img
                    src={userSchool.logo}
                    alt={`${userSchool.name} Logo`}
                    className="h-6 w-6 object-contain"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                )}
                <h1 className="text-xl font-semibold">
                  {userSchool ? userSchool.name : 'LearnSphere'}
                </h1>
              </div>

              <div className="flex items-center gap-2">
                {/* Notification Bell */}
                <Link href="/notifications">
                  <Button variant="ghost" size="icon" className="relative" data-testid="button-notifications-mobile">
                    <Bell className="h-5 w-5" />
                    {unreadNotifications > 0 && (
                      <Badge 
                        variant="destructive" 
                        className="absolute -top-1 -right-1 h-4 w-4 rounded-full p-0 flex items-center justify-center text-[10px]"
                        data-testid="badge-notification-count-mobile"
                      >
                        {unreadNotifications > 9 ? '9+' : unreadNotifications}
                      </Badge>
                    )}
                  </Button>
                </Link>
                {/* Cart Button - Force re-render by adding key */}
                <CartButton key="cart-button" />
                {isAuthenticated && user && (
                  <div className="flex items-center gap-2">
                    <div className="rounded-full bg-primary/10 p-1">
                      <User className="h-4 w-4 text-primary" />
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleLogout}
                    >
                      <LogOut className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Desktop header with cart */}
          <div className="hidden lg:block">
            <div className="flex items-center justify-end bg-white px-6 py-3 shadow-sm border-b">
              <div className="flex items-center gap-4">
                {/* Notification Bell */}
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
                {/* Cart Button - Force re-render by adding key */}
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
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleLogout}
                    >
                      <LogOut className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Page content */}
          <main className="flex-1">
            {children}
          </main>
        </div>

        {/* Cart drawer */}
        <CartDrawer />
      </div>
    </CartProvider>
  );
}