import React, { useState } from "react";
import { useLocation, Link } from "wouter";
import {
  School,
  Calendar,
  Users,
  BookOpen,
  ChevronLeft,
  Menu,
  Home,
  LogOut,
  User,
  Link as LucideLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuth } from "@/components/SupabaseProvider";
import { useRole } from "@/contexts/RoleContext";
import { apiRequest } from "@/lib/queryClient";

interface SidebarProps {
  className?: string;
}

export default function SchoolAdminSidebar({ className }: SidebarProps) {
  const [location] = useLocation();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const { user, signOut, isAuthenticated } = useAuth();
  const { activeRole } = useRole();

  const handleLogout = async () => {
    console.log("🚪 SchoolAdminSidebar logout clicked");
    await signOut();
  };

  const schoolNavItems = [
    {
      title: "Dashboard",
      href: "/dashboard",
      icon: <Home className="h-5 w-5" />,
    },
    {
      title: "My School",
      href: "/schools/my-school",
      icon: <School className="h-5 w-5" />,
    },
    {
      title: "Classes",
      href: "/schools/classes",
      icon: <Calendar className="h-5 w-5" />,
    },
    {
      title: "Staff",
      href: "/schools/staff",
      icon: <Users className="h-5 w-5" />,
    },
    {
      title: "Students",
      href: "/schools/students",
      icon: <Users className="h-5 w-5" />,
    },
    {
      title: "Marketing Links",
      href: "/marketing-links",
      icon: <LucideLink className="h-5 w-5" />,
    },
    {
      title: "Knowledge Base",
      href: "/schools/knowledge-base",
      icon: <BookOpen className="h-5 w-5" />,
    },
  ];

  return (
    <div
      className={cn(
        "flex flex-col border-r bg-white transition-all duration-300",
        isCollapsed ? "w-16" : "w-64",
        className,
      )}
    >
      <div className="p-4 flex items-center justify-between border-b">
        {!isCollapsed && <h2 className="text-xl font-bold">School Admin</h2>}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsCollapsed(!isCollapsed)}
          className={isCollapsed ? "mx-auto" : "ml-auto"}
        >
          {isCollapsed ? (
            <Menu className="h-5 w-5" />
          ) : (
            <ChevronLeft className="h-5 w-5" />
          )}
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto py-4 px-3">
        <nav className="space-y-2">
          {schoolNavItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center px-2 py-3 rounded-lg transition-colors",
                location === item.href
                  ? "bg-primary text-white"
                  : "text-gray-700 hover:bg-gray-100",
                !isCollapsed && "justify-start",
                isCollapsed && "justify-center",
              )}
            >
              {item.icon}
              {!isCollapsed && <span className="ml-3">{item.title}</span>}
            </Link>
          ))}
        </nav>
      </div>

      {/* User Profile Section - matches main sidebar */}
      {isAuthenticated && user && (
        <div className="border-t border-gray-200 p-3">
          {!isCollapsed && (
            <div className="flex items-center space-x-3 mb-3">
              <div className="flex-shrink-0">
                <div className="h-8 w-8 bg-primary rounded-full flex items-center justify-center">
                  <User className="h-4 w-4 text-white" />
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {user.user_metadata?.full_name || user.email}
                </p>
                <p className="text-xs text-gray-500 truncate">
                  {activeRole === 'parent' ? 'Parent Account' : 'School Administrator'}
                </p>
              </div>
            </div>
          )}
          <Button
            onClick={handleLogout}
            variant="ghost"
            className={cn(
              "w-full flex items-center text-gray-700 hover:bg-red-50 hover:text-red-600",
              isCollapsed ? "justify-center px-2" : "justify-start px-2",
            )}
          >
            <LogOut className="h-4 w-4" />
            {!isCollapsed && <span className="ml-2">Logout</span>}
          </Button>
        </div>
      )}
    </div>
  );
}
