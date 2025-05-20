import React, { useState } from "react";
import { useLocation, Link } from "wouter";
import { School, Calendar, Users, BookOpen, ChevronLeft, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface SidebarProps {
  className?: string;
}

export default function SchoolAdminSidebar({ className }: SidebarProps) {
  const [location] = useLocation();
  const [isCollapsed, setIsCollapsed] = useState(false);

  const schoolNavItems = [
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
        className
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
                isCollapsed && "justify-center"
              )}
            >
              {item.icon}
              {!isCollapsed && <span className="ml-3">{item.title}</span>}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}