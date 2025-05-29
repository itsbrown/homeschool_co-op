import { PropsWithChildren } from "react";
import { Link, useLocation } from "wouter";
import { 
  BarChart3, 
  BookOpen, 
  Calendar, 
  GraduationCap, 
  Home, 
  LayoutDashboard, 
  Settings, 
  ShoppingCart, 
  Users,
  FileText,
  CreditCard
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useAuth } from @/hooks/useAuth00";

interface SidebarItemProps {
  href: string;
  title: string;
  icon: React.ReactNode;
  isActive?: boolean;
}

function SidebarItem({ href, title, icon, isActive }: SidebarItemProps) {
  return (
    <Link href={href}>
      <Button
        variant="ghost"
        size="lg"
        className={cn(
          "w-full justify-start gap-2 text-muted-foreground",
          isActive && "bg-muted font-semibold text-foreground"
        )}
      >
        {icon}
        {title}
      </Button>
    </Link>
  );
}

export function AdminShell({ children }: PropsWithChildren) {
  const [location] = useLocation();
  const { user } = useAuth();

  return (
    <div className="flex min-h-screen">
      <aside className="fixed left-0 top-0 z-10 hidden h-full w-56 flex-col border-r bg-background sm:flex">
        <div className="border-b p-4">
          <Link href="/">
            <h2 className="text-xl font-bold text-primary">LearnSphere</h2>
          </Link>
        </div>
        <div className="flex-1 overflow-auto p-3">
          <div className="mb-2 px-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            MAIN
          </div>
          <div className="space-y-1">
            <SidebarItem
              href="/dashboard"
              title="Dashboard"
              icon={<LayoutDashboard className="h-5 w-5" />}
              isActive={location === "/dashboard"}
            />
            <SidebarItem
              href="/admin/users"
              title="Users"
              icon={<Users className="h-5 w-5" />}
              isActive={location.startsWith("/admin/users")}
            />
            <SidebarItem
              href="/admin/classes"
              title="Classes"
              icon={<GraduationCap className="h-5 w-5" />}
              isActive={location.startsWith("/admin/classes")}
            />
            <SidebarItem
              href="/admin/programs"
              title="Programs"
              icon={<FileText className="h-5 w-5" />}
              isActive={location.startsWith("/admin/programs")}
            />
            <SidebarItem
              href="/curriculum"
              title="Curricula"
              icon={<BookOpen className="h-5 w-5" />}
              isActive={location.startsWith("/curriculum")}
            />
            <SidebarItem
              href="/knowledge-base"
              title="Curriculum Marketplace"
              icon={<ShoppingCart className="h-5 w-5" />}
              isActive={location.startsWith("/knowledge-base")}
            />
          </div>
          <div className="my-2 px-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            MANAGEMENT
          </div>
          <div className="space-y-1">
            <SidebarItem
              href="/calendar"
              title="Calendar"
              icon={<Calendar className="h-5 w-5" />}
              isActive={location.startsWith("/calendar")}
            />
            <SidebarItem
              href="/admin/analytics"
              title="Analytics"
              icon={<BarChart3 className="h-5 w-5" />}
              isActive={location.startsWith("/admin/analytics")}
            />
            <SidebarItem
              href="/admin/payments"
              title="Payments"
              icon={<CreditCard className="h-5 w-5" />}
              isActive={location.startsWith("/admin/payments")}
            />
            <SidebarItem
              href="/admin/settings"
              title="Settings"
              icon={<Settings className="h-5 w-5" />}
              isActive={location.startsWith("/admin/settings")}
            />
          </div>
        </div>
      </aside>
      <div className="flex-1 sm:ml-56">
        <header className="sticky top-0 z-10 flex h-16 items-center gap-4 border-b bg-background px-4 sm:px-6">
          <div className="flex flex-1 items-center gap-2">
            {/* Mobile nav button would go here */}
          </div>
          <div className="flex items-center gap-4">
            <div className="text-sm text-muted-foreground">
              {user?.username}
            </div>
          </div>
        </header>
        <main className="container mx-auto px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}