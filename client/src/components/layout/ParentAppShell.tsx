import React, { useState, useEffect } from "react";
import { useAuth } from "@/components/SupabaseProvider";
import { useRole } from "@/contexts/RoleContext";
import { CartProvider } from "@/contexts/CartContext";
import ParentSidebar from "./ParentSidebar";
import CartDrawer from "@/components/cart/CartDrawer";
import CartButton from "@/components/cart/CartButton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetTrigger, SheetClose } from "@/components/ui/sheet";
import { LogOut, Menu, User, Bell, X, Home, Users, BookOpen, Calendar, DollarSign, Bot, Brain, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ScrollArea } from "@/components/ui/scroll-area";

interface ParentAppShellProps {
  children: React.ReactNode;
}

interface Notification {
  id: number;
  recipientStatus?: string;
}

// Mobile menu items
const mobileNavigationItems = [
  {
    href: "/dashboard",
    title: "Dashboard",
    icon: Home,
  },
  {
    href: "/children",
    title: "My Children",
    icon: Users,
  },
  {
    href: "/programs",
    title: "Programs & Classes",
    icon: BookOpen,
  },
  {
    href: "/schedule",
    title: "Family Schedule",
    icon: Calendar,
  },
  {
    href: "/payments",
    title: "Payments",
    icon: DollarSign,
  },
  {
    href: "/enrollment-assistant",
    title: "AI Enrollment Assistant",
    icon: Bot,
  },
  {
    href: "/ai-insights",
    title: "AI Insights",
    icon: Brain,
  },
  {
    href: "/settings",
    title: "Settings",
    icon: Settings,
  },
];

export default function ParentAppShell({ children }: ParentAppShellProps) {
  const { user, signOut, isAuthenticated } = useAuth();
  const { activeRole } = useRole();
  const [location] = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
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

  // Fetch user's associated school
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

          const schoolResponse = await apiRequest("GET", "/api/schools/1");
          if (schoolResponse.ok) {
            const schoolData = await schoolResponse.json();
            setUserSchool(schoolData);
          }
        } catch (error) {
          console.log('No school association found for user, using default school');
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
        {/* Desktop sidebar */}
        <div className="hidden lg:fixed lg:inset-y-0 lg:flex lg:w-64 lg:flex-col">
          <ParentSidebar />
        </div>

        {/* Main content area */}
        <div className="lg:pl-64">
          {/* Mobile header */}
          <div className="lg:hidden">
            <div className="flex items-center justify-between bg-white px-4 py-4 shadow-sm border-b">
              {/* Mobile Menu Trigger */}
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
                    {/* Mobile Menu Header */}
                    <div className="flex items-center gap-3 border-b p-4">
                      {userSchool?.logo && (
                        <img
                          src={userSchool.logo}
                          alt={`${userSchool.name} Logo`}
                          className="h-10 w-10 object-contain"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                          }}
                        />
                      )}
                      <h2 className="text-lg font-semibold">{userSchool?.name || 'LearnSphere'}</h2>
                    </div>

                    {/* Mobile Menu Navigation */}
                    <ScrollArea className="flex-1 px-3 py-4">
                      <nav className="space-y-1">
                        {mobileNavigationItems.map((item) => {
                          const Icon = item.icon;
                          const isActive = location === item.href;
                          
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
                                <span>{item.title}</span>
                              </Link>
                            </SheetClose>
                          );
                        })}
                      </nav>
                    </ScrollArea>

                    {/* Mobile Menu Footer */}
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

              {/* Logo - Center on Mobile */}
              <div className="flex-1 flex items-center justify-center px-2">
                {userSchool?.logo ? (
                  <img
                    src={userSchool.logo}
                    alt={`${userSchool.name} Logo`}
                    className="h-16 w-auto max-w-[200px] object-contain"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                ) : (
                  <h1 className="text-lg font-semibold">{userSchool?.name || 'LearnSphere'}</h1>
                )}
              </div>

              {/* Right Actions */}
              <div className="flex items-center gap-2">
                {/* Notification Bell */}
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
                
                {/* Cart Button */}
                <CartButton key="cart-button" />
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
                {/* Cart Button */}
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
