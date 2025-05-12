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
  GraduationCap,
  Sparkles,
  Layers,
  Brain,
  Library,
  Settings,
  School,
  UserPlus,
  Briefcase,
  FileText,
  Award,
  Clock,
  Building,
  CreditCard,
} from "lucide-react";

// Admin navigation items
const adminNavigationItems = [
  {
    title: "Main",
    items: [
      { name: "Dashboard", href: "/dashboard", icon: Home },
      { name: "Users", href: "/admin/users", icon: Users },
      { name: "Classes", href: "/admin/classes", icon: School },
      { name: "Programs", href: "/admin/programs", icon: BookOpen },
      { name: "Curricula", href: "/curriculum", icon: FileText },
      { name: "Curriculum Marketplace", href: "/admin/marketplace", icon: ShoppingBag },
    ],
  },
  {
    title: "Management",
    items: [
      { name: "Calendar", href: "/calendar", icon: Calendar },
      { name: "Analytics", href: "/admin/analytics", icon: BarChart2 },
      { name: "Payments", href: "/admin/payments", icon: CreditCard },
      { name: "Settings", href: "/admin/settings", icon: Settings },
    ],
  },
];

// Educator navigation items
const educatorNavigationItems = [
  {
    title: "Main",
    items: [
      { name: "Dashboard", href: "/dashboard", icon: Home },
      { name: "My Classes", href: "/educator/classes", icon: School },
      { name: "Curricula", href: "/curriculum", icon: BookOpen },
      { name: "Lessons", href: "/lessons", icon: GraduationCap },
      { name: "AI Lesson Generator", href: "/lessons/ai-generator", icon: Sparkles },
      { name: "Lesson Marketplace", href: "/educator/marketplace", icon: ShoppingBag },
    ],
  },
  {
    title: "Management",
    items: [
      { name: "Calendar", href: "/calendar", icon: Calendar },
      { name: "Students", href: "/educator/students", icon: Users },
      { name: "Reports", href: "/educator/reports", icon: FileText },
      { name: "Community", href: "/community", icon: Building },
    ],
  },
];

// Parent navigation items
const parentNavigationItems = [
  {
    title: "Main",
    items: [
      { name: "Dashboard", href: "/dashboard", icon: Home },
      { name: "My Children", href: "/children", icon: Users },
      { name: "Register Child", href: "/children/register", icon: UserPlus },
      { name: "Programs", href: "/programs", icon: Award },
      { name: "Learning Marketplace", href: "/marketplace", icon: ShoppingBag },
    ],
  },
  {
    title: "Management",
    items: [
      { name: "Calendar", href: "/calendar", icon: Calendar },
      { name: "Enrollments", href: "/enrollments", icon: FileText },
      { name: "Payments", href: "/payments", icon: CreditCard },
      { name: "Messages", href: "/messages", icon: Mail },
    ],
  },
];

// Learner navigation items
const learnerNavigationItems = [
  {
    title: "Main",
    items: [
      { name: "Dashboard", href: "/dashboard", icon: Home },
      { name: "My Courses", href: "/learner/courses", icon: BookOpen },
      { name: "Assignments", href: "/learner/assignments", icon: FileText },
      { name: "Progress", href: "/learner/progress", icon: Award },
      { name: "Learning Resources", href: "/learner/resources", icon: Library },
      { name: "Virtual Tutor", href: "/tutor", icon: User },
    ],
  },
  {
    title: "Tools",
    items: [
      { name: "Calendar", href: "/learner/calendar", icon: Calendar },
      { name: "Community", href: "/community", icon: Users },
      { name: "Resources", href: "/learner/resources", icon: Briefcase },
    ],
  },
];

export default function Sidebar() {
  const [location] = useLocation();
  const { user, logout } = useAuth();

  // Get the appropriate navigation items based on user role
  const getRoleNavigationItems = () => {
    if (!user || !user.role) {
      return [];
    }

    switch (user.role) {
      case "admin":
        return adminNavigationItems;
      case "educator":
        return educatorNavigationItems;
      case "parent":
        return parentNavigationItems;
      case "learner":
        return learnerNavigationItems;
      default:
        // Default navigation as fallback
        return parentNavigationItems;
    }
  };

  const navigationItems = getRoleNavigationItems();

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
                const isActive = location === item.href || 
                                (item.href !== "/dashboard" && location.startsWith(item.href));
                
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={cn(
                      "flex items-center px-4 py-2 text-sm font-medium transition-colors",
                      isActive
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
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
            {user?.name ? user.name.charAt(0).toUpperCase() : "U"}
          </div>
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
