import { useAuth0 } from "@auth0/auth0-react";
import { Link, useLocation } from "wouter";
import { 
  Home, 
  Users, 
  BookOpen, 
  Calendar, 
  CreditCard, 
  Bot, 
  Settings, 
  LogOut,
  User
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const { user, logout } = useAuth0();
  const [location] = useLocation();

  // Fetch user's associated school for branding
  const { data: schoolData } = useQuery({
    queryKey: ['/api/school-parents/school', user?.email],
    enabled: !!user?.email,
    staleTime: 300000, // Cache for 5 minutes
  });

  const navigationItems = [
    { href: "/", label: "Dashboard", icon: Home },
    { href: "/children", label: "My Children", icon: Users },
    { href: "/programs", label: "Programs & Classes", icon: BookOpen },
    { href: "/schedule", label: "Family Schedule", icon: Calendar },
    { href: "/payments", label: "Payments", icon: CreditCard },
    { href: "/ai-assistant", label: "AI Enrollment Assistant", icon: Bot },
    { href: "/settings", label: "Settings", icon: Settings },
  ];

  const handleLogout = () => {
    logout({ logoutParams: { returnTo: window.location.origin } });
  };

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <div className="w-64 bg-white shadow-lg flex flex-col">
        {/* Logo */}
        <div className="p-6 border-b">
          {schoolData?.success && schoolData?.school?.logo ? (
            <div className="flex items-center gap-3">
              <img 
                src={schoolData.school.logo} 
                alt={`${schoolData.school.name} Logo`}
                className="h-8 w-8 object-contain"
                onError={(e) => {
                  // Fallback to school name if logo fails to load
                  e.currentTarget.style.display = 'none';
                  e.currentTarget.nextElementSibling.style.display = 'block';
                }}
              />
              <div style={{ display: 'none' }}>
                <h1 className="text-xl font-bold text-gray-900">{schoolData.school.name}</h1>
              </div>
              <h1 className="text-xl font-bold text-gray-900">{schoolData.school.name}</h1>
            </div>
          ) : schoolData?.success && schoolData?.school?.name ? (
            <h1 className="text-2xl font-bold text-gray-900">{schoolData.school.name}</h1>
          ) : (
            <h1 className="text-2xl font-bold text-gray-900">LearnSphere</h1>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-2">
          {navigationItems.map((item) => {
            const Icon = item.icon;
            const isActive = location === item.href;
            
            return (
              <Link key={item.href} href={item.href}>
                <div
                  className={`flex items-center space-x-3 px-3 py-2 rounded-lg transition-colors ${
                    isActive
                      ? "bg-blue-50 text-blue-700"
                      : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                  }`}
                >
                  <Icon className="h-5 w-5" />
                  <span className="font-medium">{item.label}</span>
                </div>
              </Link>
            );
          })}
        </nav>

        {/* User Profile Section */}
        <div className="p-4 border-t">
          <div className="flex items-center space-x-3 mb-3">
            <Avatar className="h-8 w-8">
              <AvatarImage src={user?.picture} alt={user?.name || ""} />
              <AvatarFallback>
                <User className="h-4 w-4" />
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">
                {user?.name || "User"}
              </p>
              <p className="text-xs text-gray-500">Parent Account</p>
            </div>
          </div>
          
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLogout}
            className="w-full justify-start text-gray-600 hover:text-gray-900"
          >
            <LogOut className="h-4 w-4 mr-2" />
            Log Out
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}