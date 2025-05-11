import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  BookOpen,
  BarChart,
  FileText,
  Database,
  ShoppingCart,
  Users,
  Calendar,
  School,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

export function DashboardNav() {
  const [location] = useLocation();
  const { user } = useAuth();
  
  const userData = user as any;
  const isAdmin = userData?.role === "admin";
  const isParent = userData?.role === "parent";
  const isEducator = userData?.role === "educator";

  const navItems = [
    {
      title: "Dashboard",
      href: "/dashboard",
      icon: BarChart,
      show: true,
    },
    {
      title: "Curriculum",
      href: "/curriculum",
      icon: BookOpen,
      show: isEducator || isAdmin,
    },
    {
      title: "Lessons",
      href: "/lessons",
      icon: FileText,
      show: isEducator || isAdmin,
    },
    {
      title: "Knowledge Base",
      href: "/knowledge-base",
      icon: Database,
      show: true,
    },
    {
      title: "Marketplace",
      href: "/marketplace",
      icon: ShoppingCart,
      show: true,
    },
    {
      title: "Registration",
      href: "/registration",
      icon: Users,
      show: isParent || isAdmin,
    },
    {
      title: "Programs",
      href: "/programs",
      icon: School,
      show: true,
    },
    {
      title: "Calendar",
      href: "/calendar",
      icon: Calendar,
      show: true,
    },
  ];

  return (
    <nav className="grid items-start gap-2">
      {navItems.filter(item => item.show).map((item) => {
        const Icon = item.icon;
        return (
          <Link to={item.href} key={item.href}>
            <Button
              variant={location === item.href ? "secondary" : "ghost"}
              className="w-full justify-start"
            >
              <Icon className="mr-2 h-4 w-4" />
              {item.title}
            </Button>
          </Link>
        );
      })}
    </nav>
  );
}