import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import {
  Home,
  BookOpen,
  ShoppingBag,
  Users,
  Calendar,
  Mail,
  BarChart2,
  DollarSign,
  User,
  LogOut,
} from "lucide-react";

const navigationItems = [
  {
    title: "Main",
    items: [
      { name: "Dashboard", href: "/dashboard", icon: Home },
      { name: "My Curriculum", href: "/curriculum", icon: BookOpen },
      { name: "Knowledge Marketplace", href: "/marketplace", icon: ShoppingBag },
      { name: "Virtual Tutor", href: "/tutor", icon: User },
      { name: "Community", href: "/community", icon: Users },
    ],
  },
  {
    title: "Management",
    items: [
      { name: "Summer Camps", href: "/camps", icon: Calendar },
      { name: "Email Center", href: "/email", icon: Mail },
      { name: "Analytics", href: "/analytics", icon: BarChart2 },
      { name: "Discounts & Referrals", href: "/discounts", icon: DollarSign },
    ],
  },
];

export default function Sidebar() {
  const [location] = useLocation();
  const { user, logout } = useAuth();

  return (
    <div className="flex flex-col w-64 bg-sidebar border-r border-sidebar-border h-screen">
      {/* Logo and brand */}
      <div className="flex items-center h-16 px-4 border-b border-sidebar-border">
        <span className="text-xl font-semibold text-sidebar-primary">LearnSphere</span>
      </div>

      {/* Navigation links */}
      <nav className="flex-1 overflow-y-auto">
        {navigationItems.map((section) => (
          <div key={section.title} className="py-4">
            <div className="px-4 pb-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {section.title}
              </p>
            </div>
            <div className="space-y-1">
              {section.items.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={cn(
                      "flex items-center px-4 py-2 text-sm font-medium transition-colors",
                      location === item.href
                        ? "bg-sidebar-accent text-sidebar-primary"
                        : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-primary"
                    )}
                  >
                    <Icon className="h-5 w-5 mr-3" aria-hidden="true" />
                    {item.name}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* User profile */}
      <div className="flex items-center p-4 border-t border-sidebar-border">
        <div className="flex-shrink-0">
          <img
            src={user?.avatar || "https://images.unsplash.com/photo-1494790108377-be9c29b29330?ixlib=rb-1.2.1&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80"}
            alt="User profile"
            className="w-8 h-8 rounded-full"
          />
        </div>
        <div className="ml-3 min-w-0 flex-1">
          <p className="text-sm font-medium text-sidebar-foreground truncate">{user?.name || "User"}</p>
          <p className="text-xs text-muted-foreground truncate capitalize">{user?.role || "User"}</p>
        </div>
        <button
          onClick={() => logout()}
          className="ml-auto text-muted-foreground hover:text-sidebar-primary"
          aria-label="Log out"
        >
          <LogOut className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
